import { useState, useRef } from "react";

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 2MB

function getApiUrl() {
  const isDev = window.location.port === "5173";
  const host = window.location.hostname;
  return isDev ? `http://${host}:3000` : "";
}

export default function FeedbackModal({ onClose }) {
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [screenshot, setScreenshot] = useState(null); // base64 data URL
  const [screenshotName, setScreenshotName] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");
  const fileRef = useRef(null);
  const openedAt = useRef(Date.now());

  function handleScreenshot(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({ ...prev, screenshot: "File must be an image." }));
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setErrors((prev) => ({ ...prev, screenshot: "Image must be under 2MB." }));
      return;
    }
    setErrors((prev) => ({ ...prev, screenshot: undefined }));
    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result);
    reader.readAsDataURL(file);
  }

  function removeScreenshot() {
    setScreenshot(null);
    setScreenshotName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function validate() {
    const errs = {};
    if (!type) errs.type = "Pick a type.";
    if (!name.trim()) errs.name = "Name is required.";
    else if (name.length > 50) errs.name = "Max 50 characters.";
    if (!subject.trim()) errs.subject = "Subject is required.";
    else if (subject.length > 100) errs.subject = "Max 100 characters.";
    if (!description.trim()) errs.description = "Description is required.";
    else if (description.length > 2000) errs.description = "Max 2000 characters.";
    if (email && email.length > 100) errs.email = "Max 100 characters.";
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError("");
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const resp = await fetch(`${getApiUrl()}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim(),
          subject: subject.trim(),
          description: description.trim(),
          email: email.trim() || undefined,
          screenshot: screenshot || undefined,
          website: website || undefined,
          openedAt: openedAt.current,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setServerError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      setTimeout(() => onClose(), 2000);
    } catch {
      setServerError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="feedback-backdrop" onClick={onClose}>
        <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
          <div className="feedback-success">Thanks for your feedback!</div>
        </div>
      </div>
    );
  }

  const types = [
    { key: "bug", icon: "🐛", label: "Bug" },
    { key: "feature", icon: "✨", label: "Feature" },
    { key: "other", icon: "💬", label: "Other" },
  ];

  return (
    <div className="feedback-backdrop" onClick={onClose}>
      <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-header">
          <span className="feedback-title">Send Feedback</span>
          <button type="button" className="feedback-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="feedback-field">
            <label className="feedback-label">Type *</label>
            <div className="feedback-types">
              {types.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`feedback-type-btn${type === t.key ? ` selected ${t.key}` : ""}`}
                  onClick={() => { setType(t.key); setErrors((prev) => ({ ...prev, type: undefined })); }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {errors.type && <div className="feedback-error">{errors.type}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label">Your Name *</label>
            <input
              type="text"
              className={`feedback-input${errors.name ? " invalid" : ""}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="Jane Doe"
            />
            {errors.name && <div className="feedback-error">{errors.name}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label">Subject *</label>
            <input
              type="text"
              className={`feedback-input${errors.subject ? " invalid" : ""}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={100}
              placeholder="Brief summary of your feedback"
            />
            {errors.subject && <div className="feedback-error">{errors.subject}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label">Description *</label>
            <textarea
              className={`feedback-input feedback-textarea${errors.description ? " invalid" : ""}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Describe the issue or idea..."
              rows={3}
            />
            {errors.description && <div className="feedback-error">{errors.description}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label feedback-optional">Email <span>(optional)</span></label>
            <input
              type="email"
              className={`feedback-input${errors.email ? " invalid" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={100}
              placeholder="you@example.com"
            />
            {errors.email && <div className="feedback-error">{errors.email}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label feedback-optional">Screenshot <span>(optional)</span></label>
            {screenshot ? (
              <div className="feedback-screenshot-preview">
                <img src={screenshot} alt="Screenshot preview" />
                <button type="button" className="feedback-screenshot-remove" onClick={removeScreenshot}>✕</button>
                <span className="feedback-screenshot-name">{screenshotName}</span>
              </div>
            ) : (
              <label className="feedback-file-label">
                📎 Tap to attach image
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshot}
                  style={{ display: "none" }}
                />
              </label>
            )}
            {errors.screenshot && <div className="feedback-error">{errors.screenshot}</div>}
          </div>

          {/* Honeypot — hidden from humans, bots fill it in */}
          <div className="feedback-hp-field" aria-hidden="true">
            <label className="feedback-label">Website</label>
            <input
              type="text"
              className="feedback-input"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {serverError && <div className="feedback-error feedback-server-error">{serverError}</div>}

          <button type="submit" className="feedback-submit" disabled={submitting}>
            {submitting ? "Sending..." : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}
