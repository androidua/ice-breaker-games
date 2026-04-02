const QUESTION_DURATION = 15;
const REVEAL_DURATION = 5;
const ROUND_COMPLETE_DURATION = 5;
const TOTAL_QUESTIONS = 10;

const QUESTION_BANK = [
  { q: "What planet is known as the Red Planet?", o: ["Venus", "Mars", "Jupiter", "Saturn"], c: 1 },
  { q: "What is the largest ocean on Earth?", o: ["Atlantic", "Indian", "Arctic", "Pacific"], c: 3 },
  { q: "Who painted the Mona Lisa?", o: ["Michelangelo", "Da Vinci", "Raphael", "Rembrandt"], c: 1 },
  { q: "What is the smallest country in the world?", o: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], c: 1 },
  { q: "How many bones are in the adult human body?", o: ["186", "206", "226", "256"], c: 1 },
  { q: "What element has the chemical symbol 'O'?", o: ["Gold", "Osmium", "Oxygen", "Oganesson"], c: 2 },
  { q: "Which language has the most native speakers?", o: ["English", "Hindi", "Spanish", "Mandarin"], c: 3 },
  { q: "What year did the Titanic sink?", o: ["1905", "1912", "1918", "1923"], c: 1 },
  { q: "What is the hardest natural substance?", o: ["Titanium", "Quartz", "Diamond", "Sapphire"], c: 2 },
  { q: "Which country hosted the 2016 Summer Olympics?", o: ["China", "UK", "Brazil", "Japan"], c: 2 },
  { q: "What gas do plants absorb from the atmosphere?", o: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], c: 2 },
  { q: "Who wrote 'Romeo and Juliet'?", o: ["Dickens", "Shakespeare", "Austen", "Hemingway"], c: 1 },
  { q: "What is the capital of Australia?", o: ["Sydney", "Melbourne", "Canberra", "Brisbane"], c: 2 },
  { q: "How many sides does a hexagon have?", o: ["5", "6", "7", "8"], c: 1 },
  { q: "What is the speed of light (approx)?", o: ["300 km/s", "3,000 km/s", "30,000 km/s", "300,000 km/s"], c: 3 },
  { q: "Which planet has the most moons?", o: ["Jupiter", "Saturn", "Uranus", "Neptune"], c: 1 },
  { q: "What is the largest mammal?", o: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], c: 1 },
  { q: "In which year did World War II end?", o: ["1943", "1944", "1945", "1946"], c: 2 },
  { q: "What is the currency of Japan?", o: ["Yuan", "Won", "Yen", "Ringgit"], c: 2 },
  { q: "Who discovered penicillin?", o: ["Pasteur", "Fleming", "Curie", "Darwin"], c: 1 },
  { q: "What is the tallest mountain in the world?", o: ["K2", "Kangchenjunga", "Everest", "Lhotse"], c: 2 },
  { q: "Which planet is closest to the Sun?", o: ["Venus", "Mercury", "Mars", "Earth"], c: 1 },
  { q: "How many continents are there?", o: ["5", "6", "7", "8"], c: 2 },
  { q: "What does 'HTTP' stand for?", o: ["HyperText Transfer Protocol", "High Tech Transfer Protocol", "HyperText Transmission Process", "Home Tool Transfer Protocol"], c: 0 },
  { q: "Which animal is known as the 'King of the Jungle'?", o: ["Tiger", "Lion", "Elephant", "Gorilla"], c: 1 },
  { q: "What is the boiling point of water in Celsius?", o: ["90°C", "95°C", "100°C", "110°C"], c: 2 },
  { q: "Who was the first person to walk on the Moon?", o: ["Buzz Aldrin", "Neil Armstrong", "Yuri Gagarin", "John Glenn"], c: 1 },
  { q: "What is the chemical formula for water?", o: ["HO2", "H2O", "OH", "H2O2"], c: 1 },
  { q: "Which organ pumps blood through the body?", o: ["Brain", "Lungs", "Heart", "Liver"], c: 2 },
  { q: "What is the longest river in the world?", o: ["Amazon", "Nile", "Mississippi", "Yangtze"], c: 1 },

  // Geography
  { q: "What is the capital of Canada?", o: ["Toronto", "Vancouver", "Ottawa", "Montreal"], c: 2 },
  { q: "Which country has the most natural lakes?", o: ["Russia", "USA", "Canada", "Brazil"], c: 2 },
  { q: "What is the largest desert in the world?", o: ["Sahara", "Arabian", "Gobi", "Antarctic"], c: 3 },
  { q: "Which country is home to the Great Barrier Reef?", o: ["New Zealand", "Australia", "Indonesia", "Philippines"], c: 1 },
  { q: "What is the capital of Brazil?", o: ["Rio de Janeiro", "São Paulo", "Salvador", "Brasília"], c: 3 },
  { q: "Which African country has the most pyramids?", o: ["Egypt", "Sudan", "Libya", "Ethiopia"], c: 1 },
  { q: "What is the tallest active volcano in the world?", o: ["Mount Etna", "Kilimanjaro", "Ojos del Salado", "Mauna Loa"], c: 2 },
  { q: "Which country is both in Europe and Asia?", o: ["Kazakhstan", "Turkey", "Russia", "All of these"], c: 3 },
  { q: "What is the smallest ocean in the world?", o: ["Indian", "Arctic", "Southern", "Atlantic"], c: 1 },
  { q: "Which city is known as the 'City of Love'?", o: ["Rome", "Venice", "Paris", "Vienna"], c: 2 },
  { q: "How many stars are on the Australian flag?", o: ["4", "5", "6", "7"], c: 3 },
  { q: "What country has the longest coastline?", o: ["Russia", "Norway", "Canada", "Indonesia"], c: 2 },

  // Science & Nature
  { q: "What is the most abundant gas in Earth's atmosphere?", o: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Argon"], c: 2 },
  { q: "How many chromosomes do humans have?", o: ["23", "44", "46", "48"], c: 2 },
  { q: "What is the powerhouse of the cell?", o: ["Nucleus", "Ribosome", "Mitochondria", "Vacuole"], c: 2 },
  { q: "What is the atomic number of gold?", o: ["47", "79", "82", "92"], c: 1 },
  { q: "Which planet has the Great Red Spot?", o: ["Mars", "Saturn", "Uranus", "Jupiter"], c: 3 },
  { q: "What type of animal is a Komodo dragon?", o: ["Snake", "Crocodilian", "Lizard", "Tortoise"], c: 2 },
  { q: "How many hearts does an octopus have?", o: ["1", "2", "3", "4"], c: 2 },
  { q: "What is the chemical symbol for iron?", o: ["Ir", "In", "Fe", "Fi"], c: 2 },
  { q: "What is the nearest star to Earth (besides the Sun)?", o: ["Sirius", "Proxima Centauri", "Betelgeuse", "Vega"], c: 1 },
  { q: "What force keeps planets in orbit around the Sun?", o: ["Magnetism", "Friction", "Gravity", "Electrostatics"], c: 2 },
  { q: "What is the world's largest living structure?", o: ["Amazon Rainforest", "Great Wall of China", "Great Barrier Reef", "Sahara Forest"], c: 2 },
  { q: "How long does it take light from the Sun to reach Earth?", o: ["1 minute", "8 minutes", "30 minutes", "1 hour"], c: 1 },
  { q: "What is the most common blood type?", o: ["A+", "B+", "AB+", "O+"], c: 3 },
  { q: "What element is a diamond made of?", o: ["Silicon", "Carbon", "Calcium", "Graphite"], c: 1 },

  // History
  { q: "In what year did the Berlin Wall fall?", o: ["1987", "1988", "1989", "1991"], c: 2 },
  { q: "Who was the first female Prime Minister of the UK?", o: ["Queen Elizabeth II", "Theresa May", "Margaret Thatcher", "Diana Spencer"], c: 2 },
  { q: "Which empire built Machu Picchu?", o: ["Aztec", "Maya", "Inca", "Olmec"], c: 2 },
  { q: "What year did the first iPhone launch?", o: ["2005", "2006", "2007", "2008"], c: 2 },
  { q: "Who was the first US President?", o: ["Benjamin Franklin", "John Adams", "Thomas Jefferson", "George Washington"], c: 3 },
  { q: "In which year did World War I begin?", o: ["1912", "1914", "1916", "1918"], c: 1 },
  { q: "What ancient wonder stood in Alexandria, Egypt?", o: ["Colossus of Rhodes", "Lighthouse of Alexandria", "Temple of Artemis", "Hanging Gardens"], c: 1 },
  { q: "Who was Napoleon Bonaparte's first wife?", o: ["Marie Antoinette", "Josephine", "Marie Louise", "Catherine"], c: 1 },
  { q: "Which country invented paper?", o: ["Egypt", "Japan", "India", "China"], c: 3 },
  { q: "What was the name of the first artificial satellite launched into space?", o: ["Explorer 1", "Sputnik 1", "Vostok 1", "Luna 1"], c: 1 },

  // Pop Culture & Entertainment
  { q: "What movie features the line 'I'll be back'?", o: ["RoboCop", "Total Recall", "The Terminator", "Predator"], c: 2 },
  { q: "Which band performed 'Bohemian Rhapsody'?", o: ["The Beatles", "Led Zeppelin", "Queen", "The Rolling Stones"], c: 2 },
  { q: "Who plays Iron Man in the Marvel Cinematic Universe?", o: ["Chris Evans", "Robert Downey Jr.", "Mark Ruffalo", "Chris Hemsworth"], c: 1 },
  { q: "What is the best-selling video game of all time?", o: ["Tetris", "GTA V", "Minecraft", "Wii Sports"], c: 2 },
  { q: "Which TV show features dragons and the Iron Throne?", o: ["The Witcher", "Vikings", "Game of Thrones", "Merlin"], c: 2 },
  { q: "What year was Netflix founded?", o: ["1995", "1997", "1999", "2001"], c: 1 },
  { q: "Who sang 'Shape of You'?", o: ["Justin Bieber", "Ed Sheeran", "Sam Smith", "Harry Styles"], c: 1 },
  { q: "What is the highest-grossing film of all time (adjusted for inflation)?", o: ["Avatar", "Titanic", "Gone with the Wind", "Avengers: Endgame"], c: 2 },
  { q: "Which country does the K-pop group BTS come from?", o: ["Japan", "China", "South Korea", "Taiwan"], c: 2 },
  { q: "What is the name of Batman's butler?", o: ["James", "Harold", "Alfred", "Richard"], c: 2 },
  { q: "Which streaming platform produced 'Stranger Things'?", o: ["HBO", "Amazon Prime", "Disney+", "Netflix"], c: 3 },
  { q: "What is the name of the wizard school in Harry Potter?", o: ["Beauxbatons", "Durmstrang", "Hogwarts", "Ilvermorny"], c: 2 },

  // Sports
  { q: "How many players are on a basketball team on the court?", o: ["4", "5", "6", "7"], c: 1 },
  { q: "Which country has won the most FIFA World Cups?", o: ["Germany", "Argentina", "Italy", "Brazil"], c: 3 },
  { q: "In tennis, what is the term for zero points?", o: ["Nil", "Nothing", "Love", "Zero"], c: 2 },
  { q: "How often are the Summer Olympics held?", o: ["Every 2 years", "Every 3 years", "Every 4 years", "Every 5 years"], c: 2 },
  { q: "What sport is played at Wimbledon?", o: ["Cricket", "Squash", "Badminton", "Tennis"], c: 3 },
  { q: "Which country invented the sport of cricket?", o: ["Australia", "India", "England", "South Africa"], c: 2 },
  { q: "How many rings are on the Olympic flag?", o: ["4", "5", "6", "7"], c: 1 },
  { q: "Who has won the most Grand Slam tennis titles (men's)?", o: ["Roger Federer", "Rafael Nadal", "Novak Djokovic", "Pete Sampras"], c: 2 },
  { q: "What is the maximum score in ten-pin bowling?", o: ["200", "250", "300", "350"], c: 2 },
  { q: "Which sport uses a puck?", o: ["Polo", "Lacrosse", "Ice Hockey", "Field Hockey"], c: 2 },

  // Food & Drink
  { q: "What country does sushi originally come from?", o: ["China", "Korea", "Japan", "Thailand"], c: 2 },
  { q: "What is the main ingredient in guacamole?", o: ["Tomato", "Avocado", "Lime", "Onion"], c: 1 },
  { q: "Which country invented pizza?", o: ["USA", "Greece", "Italy", "France"], c: 2 },
  { q: "What type of nuts are used in marzipan?", o: ["Walnuts", "Hazelnuts", "Cashews", "Almonds"], c: 3 },
  { q: "What is the world's most expensive spice by weight?", o: ["Vanilla", "Cardamom", "Saffron", "Black Pepper"], c: 2 },
  { q: "How many calories are in a gram of fat?", o: ["4", "7", "9", "11"], c: 2 },
  { q: "What fruit is known as the 'king of fruits' in Southeast Asia?", o: ["Mango", "Jackfruit", "Durian", "Rambutan"], c: 2 },
  { q: "What cheese is traditionally used on a Margherita pizza?", o: ["Cheddar", "Brie", "Gouda", "Mozzarella"], c: 3 },
  { q: "What is the main ingredient in a traditional hummus?", o: ["Lentils", "Chickpeas", "Kidney Beans", "Fava Beans"], c: 1 },
  { q: "Which country produces the most coffee in the world?", o: ["Colombia", "Ethiopia", "Vietnam", "Brazil"], c: 3 },

  // Technology
  { q: "What does 'AI' stand for?", o: ["Automated Intelligence", "Artificial Intelligence", "Advanced Interface", "Adaptive Input"], c: 1 },
  { q: "Who co-founded Apple with Steve Jobs?", o: ["Bill Gates", "Steve Wozniak", "Elon Musk", "Jeff Bezos"], c: 1 },
  { q: "What does 'CPU' stand for?", o: ["Central Processing Unit", "Computer Power Unit", "Core Processing Utility", "Central Program Unit"], c: 0 },
  { q: "In what year was the World Wide Web invented?", o: ["1983", "1989", "1993", "1997"], c: 1 },
  { q: "What programming language was JavaScript originally called?", o: ["LiveScript", "WebScript", "NetScript", "DynaScript"], c: 0 },
  { q: "Which company makes the Android operating system?", o: ["Apple", "Microsoft", "Samsung", "Google"], c: 3 },
  { q: "What does 'USB' stand for?", o: ["Universal Serial Bus", "Unified System Board", "Ultra Speed Broadband", "Universal Sync Bridge"], c: 0 },
  { q: "What is the name of the world's first computer bug (literally)?", o: ["A fly", "A moth", "A beetle", "A spider"], c: 1 },
  { q: "Which company owns Instagram?", o: ["Twitter/X", "Google", "Meta", "Snapchat"], c: 2 },
  { q: "How many bits are in a byte?", o: ["4", "6", "8", "16"], c: 2 },

  // Animals
  { q: "What is the fastest land animal?", o: ["Lion", "Cheetah", "Ostrich", "Greyhound"], c: 1 },
  { q: "How many legs does a spider have?", o: ["6", "8", "10", "12"], c: 1 },
  { q: "What is a group of lions called?", o: ["Pack", "Herd", "Pride", "Colony"], c: 2 },
  { q: "Which bird is known for mimicking human speech?", o: ["Robin", "Parrot", "Toucan", "Canary"], c: 1 },
  { q: "What is the only mammal capable of true flight?", o: ["Flying Squirrel", "Sugar Glider", "Bat", "Flying Fish"], c: 2 },
  { q: "How long is an elephant's pregnancy (approx)?", o: ["12 months", "16 months", "22 months", "26 months"], c: 2 },
  { q: "What colour is a polar bear's skin?", o: ["White", "Pink", "Black", "Grey"], c: 2 },
  { q: "What is the largest species of shark?", o: ["Bull Shark", "Hammerhead", "Great White", "Whale Shark"], c: 3 },
  { q: "Which animal has the longest lifespan?", o: ["Tortoise", "Bowhead Whale", "Greenland Shark", "Ocean Quahog Clam"], c: 3 },
  { q: "What do you call a baby kangaroo?", o: ["Cub", "Joey", "Calf", "Pup"], c: 1 },

  // Art & Literature
  { q: "Who wrote '1984'?", o: ["Aldous Huxley", "Ray Bradbury", "George Orwell", "H.G. Wells"], c: 2 },
  { q: "Which artist cut off part of his own ear?", o: ["Pablo Picasso", "Salvador Dalí", "Claude Monet", "Vincent van Gogh"], c: 3 },
  { q: "Who wrote 'Pride and Prejudice'?", o: ["Charlotte Brontë", "Emily Brontë", "Jane Austen", "George Eliot"], c: 2 },
  { q: "What is the name of the painting with a woman with a mysterious smile?", o: ["Starry Night", "The Last Supper", "The Birth of Venus", "Mona Lisa"], c: 3 },
  { q: "Which author wrote the 'Harry Potter' series?", o: ["Suzanne Collins", "Stephenie Meyer", "J.K. Rowling", "Philip Pullman"], c: 2 },
  { q: "In which city is the Louvre museum?", o: ["London", "Madrid", "Rome", "Paris"], c: 3 },
  { q: "Who wrote 'The Great Gatsby'?", o: ["Ernest Hemingway", "F. Scott Fitzgerald", "John Steinbeck", "William Faulkner"], c: 1 },
  { q: "What art movement is Salvador Dalí associated with?", o: ["Impressionism", "Cubism", "Surrealism", "Expressionism"], c: 2 },

  // Math & Logic
  { q: "What is the value of Pi (to 2 decimal places)?", o: ["3.12", "3.14", "3.16", "3.18"], c: 1 },
  { q: "What is 12 squared?", o: ["120", "132", "144", "148"], c: 2 },
  { q: "How many degrees are in a right angle?", o: ["45", "60", "90", "180"], c: 2 },
  { q: "What is the next prime number after 7?", o: ["8", "9", "10", "11"], c: 3 },
  { q: "What is 15% of 200?", o: ["20", "25", "30", "35"], c: 2 },
  { q: "How many faces does a cube have?", o: ["4", "5", "6", "8"], c: 2 },
  { q: "What is the square root of 144?", o: ["10", "11", "12", "13"], c: 2 },

  // ── Additional questions (v1.3.9) ──────────────────────────────

  // Geography 2
  { q: "What is the capital of South Korea?", o: ["Busan", "Incheon", "Seoul", "Daegu"], c: 2 },
  { q: "Which river runs through London?", o: ["Seine", "Rhine", "Danube", "Thames"], c: 3 },
  { q: "What is the largest country by area?", o: ["Canada", "China", "USA", "Russia"], c: 3 },
  { q: "Which US state is the largest by area?", o: ["Texas", "Montana", "Alaska", "California"], c: 2 },
  { q: "What is the deepest ocean trench?", o: ["Tonga Trench", "Mariana Trench", "Java Trench", "Puerto Rico Trench"], c: 1 },
  { q: "Which European country is shaped like a boot?", o: ["Spain", "Greece", "Italy", "Portugal"], c: 2 },
  { q: "What is the capital of Egypt?", o: ["Alexandria", "Cairo", "Luxor", "Giza"], c: 1 },
  { q: "Which country has the most time zones?", o: ["Russia", "USA", "France", "China"], c: 2 },
  { q: "What strait separates Europe from Africa?", o: ["Bosporus", "Gibraltar", "Hormuz", "Malacca"], c: 1 },
  { q: "Which country is known as the Land of the Rising Sun?", o: ["China", "Thailand", "Japan", "South Korea"], c: 2 },

  // Science & Nature 2
  { q: "What is the largest organ in the human body?", o: ["Liver", "Brain", "Skin", "Lungs"], c: 2 },
  { q: "How many bones does a shark have?", o: ["0", "50", "100", "206"], c: 0 },
  { q: "What vitamin does the sun help your body produce?", o: ["Vitamin A", "Vitamin C", "Vitamin D", "Vitamin K"], c: 2 },
  { q: "What is the hardest rock?", o: ["Granite", "Basalt", "Diamond", "Quartzite"], c: 2 },
  { q: "How many teeth does an adult human typically have?", o: ["28", "30", "32", "34"], c: 2 },
  { q: "What gas makes soda fizzy?", o: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Helium"], c: 2 },
  { q: "What is the study of earthquakes called?", o: ["Geology", "Seismology", "Meteorology", "Volcanology"], c: 1 },
  { q: "Which planet rotates on its side?", o: ["Neptune", "Saturn", "Uranus", "Pluto"], c: 2 },
  { q: "What part of the brain controls balance?", o: ["Frontal Lobe", "Cerebellum", "Hippocampus", "Brain Stem"], c: 1 },
  { q: "What is the most common element in the universe?", o: ["Helium", "Oxygen", "Carbon", "Hydrogen"], c: 3 },

  // History 2
  { q: "Who was the first woman to fly solo across the Atlantic?", o: ["Bessie Coleman", "Amelia Earhart", "Harriet Quimby", "Amy Johnson"], c: 1 },
  { q: "What was the last country to abolish slavery?", o: ["USA", "Brazil", "Mauritania", "Saudi Arabia"], c: 2 },
  { q: "Which war was fought between the North and South in the US?", o: ["Revolution", "Civil War", "War of 1812", "Mexican-American War"], c: 1 },
  { q: "Who built the Great Wall of China?", o: ["Han Dynasty", "Song Dynasty", "Qin Dynasty", "Ming Dynasty"], c: 2 },
  { q: "What year did humans first land on the Moon?", o: ["1965", "1967", "1969", "1971"], c: 2 },
  { q: "Which civilization built the Colosseum?", o: ["Greek", "Egyptian", "Roman", "Persian"], c: 2 },
  { q: "What did Alexander Graham Bell invent?", o: ["Light Bulb", "Telegraph", "Telephone", "Radio"], c: 2 },
  { q: "Which country gifted the Statue of Liberty to the US?", o: ["UK", "Spain", "France", "Netherlands"], c: 2 },
  { q: "What year did the Cold War end?", o: ["1985", "1989", "1991", "1993"], c: 2 },
  { q: "Who was known as the 'Maid of Orléans'?", o: ["Marie Curie", "Joan of Arc", "Catherine de Medici", "Cleopatra"], c: 1 },

  // Pop Culture 2
  { q: "What is the name of the galaxy in Star Wars?", o: ["Milky Way", "Andromeda", "A galaxy far far away", "Pegasus"], c: 2 },
  { q: "Which superhero is also known as the 'Dark Knight'?", o: ["Superman", "Spider-Man", "Batman", "Iron Man"], c: 2 },
  { q: "What animated film features a clownfish named Nemo?", o: ["Shark Tale", "Finding Nemo", "The Little Mermaid", "Moana"], c: 1 },
  { q: "Who directed 'Jurassic Park'?", o: ["James Cameron", "George Lucas", "Steven Spielberg", "Ridley Scott"], c: 2 },
  { q: "What band was Freddie Mercury the lead singer of?", o: ["Kiss", "Aerosmith", "Queen", "The Who"], c: 2 },
  { q: "In 'The Lord of the Rings', what is Gandalf?", o: ["An Elf", "A Hobbit", "A Wizard", "A Dwarf"], c: 2 },
  { q: "What social media platform uses a bird as its logo?", o: ["Facebook", "Twitter/X", "Instagram", "TikTok"], c: 1 },
  { q: "Who played Jack in the movie 'Titanic'?", o: ["Brad Pitt", "Leonardo DiCaprio", "Tom Cruise", "Matt Damon"], c: 1 },
  { q: "What is the name of Shrek's wife?", o: ["Rapunzel", "Fiona", "Cinderella", "Elsa"], c: 1 },
  { q: "Which Disney movie features the song 'Let It Go'?", o: ["Tangled", "Moana", "Frozen", "Brave"], c: 2 },

  // Sports 2
  { q: "What sport does Tiger Woods play?", o: ["Tennis", "Baseball", "Golf", "Cricket"], c: 2 },
  { q: "How many points is a touchdown worth in American football?", o: ["3", "5", "6", "7"], c: 2 },
  { q: "Which country hosted the 2022 FIFA World Cup?", o: ["Russia", "Qatar", "UAE", "Saudi Arabia"], c: 1 },
  { q: "What is the national sport of Canada?", o: ["Ice Hockey", "Lacrosse", "Curling", "Both Hockey & Lacrosse"], c: 3 },
  { q: "How many holes are in a standard round of golf?", o: ["9", "12", "18", "21"], c: 2 },
  { q: "Which boxer was known as 'The Greatest'?", o: ["Mike Tyson", "Muhammad Ali", "Floyd Mayweather", "Manny Pacquiao"], c: 1 },
  { q: "In which sport is a shuttlecock used?", o: ["Tennis", "Badminton", "Squash", "Table Tennis"], c: 1 },
  { q: "How long is a marathon in miles (approx)?", o: ["20 miles", "24 miles", "26.2 miles", "30 miles"], c: 2 },
  { q: "Which country dominates table tennis at the Olympics?", o: ["Japan", "South Korea", "China", "Sweden"], c: 2 },
  { q: "What is the term for three strikes in a row in bowling?", o: ["Hat Trick", "Triple", "Turkey", "Trifecta"], c: 2 },

  // Food & Drink 2
  { q: "What is the main spirit in a Mojito?", o: ["Vodka", "Tequila", "Rum", "Gin"], c: 2 },
  { q: "Which country is the origin of croissants?", o: ["France", "Austria", "Italy", "Belgium"], c: 1 },
  { q: "What is tofu made from?", o: ["Rice", "Wheat", "Soybeans", "Potatoes"], c: 2 },
  { q: "Which fruit has its seeds on the outside?", o: ["Raspberry", "Strawberry", "Blueberry", "Blackberry"], c: 1 },
  { q: "What is the most consumed beverage in the world after water?", o: ["Coffee", "Tea", "Beer", "Milk"], c: 1 },
  { q: "What country is Gouda cheese from?", o: ["Switzerland", "France", "Netherlands", "Germany"], c: 2 },
  { q: "What gives chili peppers their heat?", o: ["Citric Acid", "Capsaicin", "Piperine", "Menthol"], c: 1 },
  { q: "Which grain is sake made from?", o: ["Wheat", "Barley", "Rice", "Corn"], c: 2 },
  { q: "What is the most eaten food in the world?", o: ["Bread", "Rice", "Pasta", "Potatoes"], c: 1 },
  { q: "What nut is used to make pesto?", o: ["Walnut", "Cashew", "Pine Nut", "Almond"], c: 2 },

  // Technology 2
  { q: "What does 'HTML' stand for?", o: ["High Tech Machine Language", "HyperText Markup Language", "Home Tool Markup Language", "HyperTransfer Meta Language"], c: 1 },
  { q: "Who is the CEO of Tesla?", o: ["Jeff Bezos", "Tim Cook", "Elon Musk", "Satya Nadella"], c: 2 },
  { q: "What year was the first email sent?", o: ["1965", "1971", "1978", "1983"], c: 1 },
  { q: "What does 'GPS' stand for?", o: ["Global Positioning System", "General Purpose Satellite", "Geographic Point System", "Global Path Sensor"], c: 0 },
  { q: "Which company created the iPhone?", o: ["Samsung", "Google", "Apple", "Microsoft"], c: 2 },
  { q: "What is the most popular programming language in 2025?", o: ["Java", "Python", "JavaScript", "C++"], c: 1 },
  { q: "What does 'Wi-Fi' stand for?", o: ["Wireless Fidelity", "Nothing — it's a brand name", "Wide Frequency", "Wireless Finder"], c: 1 },
  { q: "Who founded Amazon?", o: ["Elon Musk", "Mark Zuckerberg", "Jeff Bezos", "Larry Page"], c: 2 },
  { q: "What was the first widely used web browser?", o: ["Internet Explorer", "Firefox", "Netscape Navigator", "Safari"], c: 2 },
  { q: "How many megabytes are in a gigabyte?", o: ["100", "512", "1000", "1024"], c: 3 },

  // Animals 2
  { q: "What is the tallest animal in the world?", o: ["Elephant", "Giraffe", "Moose", "Ostrich"], c: 1 },
  { q: "Which insect can carry 50 times its body weight?", o: ["Bee", "Ant", "Beetle", "Grasshopper"], c: 1 },
  { q: "What is a group of crows called?", o: ["Flock", "Murder", "Pack", "Colony"], c: 1 },
  { q: "Which sea creature has three hearts?", o: ["Starfish", "Jellyfish", "Octopus", "Seahorse"], c: 2 },
  { q: "What animal has the longest migration?", o: ["Monarch Butterfly", "Arctic Tern", "Humpback Whale", "Wildebeest"], c: 1 },
  { q: "How many humps does a Bactrian camel have?", o: ["0", "1", "2", "3"], c: 2 },
  { q: "What is the only continent with no native cats?", o: ["Australia", "Antarctica", "Both A and B", "South America"], c: 2 },
  { q: "Which animal sleeps standing up?", o: ["Cow", "Horse", "Deer", "Elephant"], c: 1 },
  { q: "What animal is known to laugh?", o: ["Chimpanzee", "Hyena", "Dolphin", "All of these"], c: 3 },
  { q: "What is a baby goat called?", o: ["Lamb", "Calf", "Kid", "Foal"], c: 2 },

  // Miscellaneous
  { q: "What colour are aircraft black boxes?", o: ["Black", "Orange", "Red", "Yellow"], c: 1 },
  { q: "How many strings does a standard guitar have?", o: ["4", "5", "6", "8"], c: 2 },
  { q: "What is the most spoken language in South America?", o: ["Spanish", "Portuguese", "English", "French"], c: 1 },
  { q: "What does DNA stand for?", o: ["Deoxyribonucleic Acid", "Dinitrogen Acid", "Dynamic Nuclear Assembly", "Double Nucleus Atom"], c: 0 },
  { q: "How many colours are in a rainbow?", o: ["5", "6", "7", "8"], c: 2 },
  { q: "What is the most common surname in the world?", o: ["Smith", "Wang", "Singh", "Kim"], c: 1 },
  { q: "What does 'SOS' stand for?", o: ["Save Our Souls", "Stop Our Ship", "Send Out Signals", "Nothing — it's just easy in Morse code"], c: 3 },
  { q: "What is the rarest blood type?", o: ["O-", "A-", "B-", "AB-"], c: 3 },
  { q: "How many keys does a standard piano have?", o: ["76", "82", "88", "92"], c: 2 },
  { q: "What is the pH of pure water?", o: ["5", "6", "7", "8"], c: 2 },
  // Music
  { q: "Which band released 'Bohemian Rhapsody'?", o: ["The Beatles", "Queen", "Led Zeppelin", "The Rolling Stones"], c: 1 },
  { q: "How many members are in BTS?", o: ["5", "6", "7", "8"], c: 2 },
  { q: "What instrument does a DJ primarily use?", o: ["Guitar", "Turntable", "Synthesiser", "Drum kit"], c: 1 },
  { q: "What does 'BPM' stand for in music?", o: ["Beats Per Minute", "Bass Per Measure", "Bars Per Movement", "Band Practice Mode"], c: 0 },
  { q: "Which singer is known as the 'Queen of Pop'?", o: ["Beyoncé", "Taylor Swift", "Madonna", "Lady Gaga"], c: 2 },
  { q: "What genre of music originated in Jamaica?", o: ["Blues", "Reggae", "Ska", "Reggae — specifically from Kingston"], c: 1 },
  { q: "How many octaves does a standard piano span?", o: ["5", "6", "7", "8"], c: 2 },
  { q: "Which artist holds the record for most Grammy wins (as of 2024)?", o: ["Michael Jackson", "Beyoncé", "Taylor Swift", "Jay-Z"], c: 1 },
  { q: "What does 'mp3' stand for?", o: ["Music Protocol 3", "MPEG Audio Layer 3", "Multi-Play 3", "Mono Play 3"], c: 1 },
  { q: "Which decade did hip-hop originate?", o: ["1960s", "1970s", "1980s", "1990s"], c: 1 },
  // Movies & TV
  { q: "Who directed Jurassic Park?", o: ["James Cameron", "Steven Spielberg", "George Lucas", "Peter Jackson"], c: 1 },
  { q: "What is the name of the toy cowboy in Toy Story?", o: ["Buzz", "Woody", "Rex", "Hamm"], c: 1 },
  { q: "Which movie features the line 'I'll be back'?", o: ["Die Hard", "RoboCop", "The Terminator", "Predator"], c: 2 },
  { q: "How many seasons of Breaking Bad are there?", o: ["3", "4", "5", "6"], c: 2 },
  { q: "What streaming platform is Stranger Things on?", o: ["HBO", "Disney+", "Netflix", "Amazon Prime"], c: 2 },
  { q: "Who plays Tony Stark in the Marvel movies?", o: ["Chris Evans", "Robert Downey Jr.", "Mark Ruffalo", "Chris Hemsworth"], c: 1 },
  { q: "What is the highest-grossing movie of all time (not adjusted for inflation)?", o: ["Titanic", "Avengers: Endgame", "Avatar", "The Lion King"], c: 2 },
  { q: "In which country was the TV show Squid Game produced?", o: ["Japan", "China", "South Korea", "Thailand"], c: 2 },
  { q: "What colour is the One Ring in The Lord of the Rings?", o: ["Silver", "Gold", "Bronze", "Copper"], c: 1 },
  { q: "Which animated movie features the song 'Let It Go'?", o: ["Moana", "Encanto", "Frozen", "Brave"], c: 2 },
  { q: "What does the 'MCU' stand for?", o: ["Marvel Comics Universe", "Marvel Cinematic Universe", "Major Creative Universe", "Marvel Character Universe"], c: 1 },
  { q: "Who wrote the Harry Potter series?", o: ["J.R.R. Tolkien", "C.S. Lewis", "J.K. Rowling", "Roald Dahl"], c: 2 },
  // Famous People
  { q: "Who was the first person to walk on the Moon?", o: ["Buzz Aldrin", "Neil Armstrong", "Yuri Gagarin", "John Glenn"], c: 1 },
  { q: "Who painted the Mona Lisa?", o: ["Michelangelo", "Raphael", "Leonardo da Vinci", "Donatello"], c: 2 },
  { q: "Who invented the telephone?", o: ["Thomas Edison", "Alexander Graham Bell", "Nikola Tesla", "Guglielmo Marconi"], c: 1 },
  { q: "What nationality was Albert Einstein?", o: ["Austrian", "Swiss", "German", "He was stateless"], c: 2 },
  { q: "Who was the first female Nobel Prize winner?", o: ["Rosalind Franklin", "Ada Lovelace", "Marie Curie", "Florence Nightingale"], c: 2 },
  { q: "Who founded Apple Computer?", o: ["Bill Gates", "Steve Jobs", "Steve Jobs and Steve Wozniak", "Elon Musk"], c: 2 },
  { q: "What was Cleopatra's nationality?", o: ["Egyptian", "Greek", "Roman", "Nubian"], c: 1 },
  { q: "Who wrote Romeo and Juliet?", o: ["Charles Dickens", "Christopher Marlowe", "William Shakespeare", "John Milton"], c: 2 },
  { q: "Which US president appears on the $100 bill?", o: ["George Washington", "Abraham Lincoln", "Benjamin Franklin", "Alexander Hamilton"], c: 2 },
  { q: "Who was the youngest person to win a Nobel Peace Prize?", o: ["Malala Yousafzai", "Greta Thunberg", "Emma Gonzalez", "Autumn Peltier"], c: 0 },
  // Internet & Technology (modern)
  { q: "What does 'URL' stand for?", o: ["Uniform Resource Locator", "Universal Reference Link", "Unified Resource Line", "User Resource Location"], c: 0 },
  { q: "In what year was the iPhone first released?", o: ["2005", "2006", "2007", "2008"], c: 2 },
  { q: "What company owns Instagram?", o: ["Twitter", "Google", "Meta", "Snap"], c: 2 },
  { q: "What does 'Wi-Fi' technically stand for?", o: ["Wireless Fidelity", "Wide Fidelity", "Wireless Frequency Interface", "It's a made-up brand name — nothing"], c: 3 },
  { q: "What is the name of Google's AI assistant?", o: ["Siri", "Cortana", "Bard / Gemini", "Alexa"], c: 2 },
  { q: "What programming language was created by Guido van Rossum?", o: ["Java", "Ruby", "Python", "Perl"], c: 2 },
  { q: "How many bits are in a byte?", o: ["4", "6", "8", "16"], c: 2 },
  { q: "What does 'GIF' stand for?", o: ["Graphic Interchange Format", "General Image File", "Global Image Frame", "Graphics Interface Format"], c: 0 },
  { q: "Which company makes the PlayStation?", o: ["Microsoft", "Nintendo", "Sony", "Sega"], c: 2 },
  { q: "What colour is the Twitter/X bird logo?", o: ["Blue", "White", "Black", "It changes"], c: 0 },
  // Art & Literature (expanded)
  { q: "Who wrote '1984'?", o: ["Aldous Huxley", "George Orwell", "Ray Bradbury", "Arthur C. Clarke"], c: 1 },
  { q: "What is the name of the famous auction house founded in London in 1744?", o: ["Christie's", "Sotheby's", "Bonhams", "Phillips"], c: 1 },
  { q: "In which museum can you find the Mona Lisa?", o: ["The British Museum", "The Prado", "The Louvre", "The Uffizi"], c: 2 },
  { q: "Who wrote 'Pride and Prejudice'?", o: ["Charlotte Brontë", "George Eliot", "Jane Austen", "Mary Shelley"], c: 2 },
  { q: "What art movement is Salvador Dalí associated with?", o: ["Impressionism", "Cubism", "Surrealism", "Dadaism"], c: 2 },
  { q: "What colour is associated with the Impressionist painter Claude Monet?", o: ["Red", "Blue", "Green", "He used many colours — known for water lilies"], c: 3 },
  // Math & Logic (expanded)
  { q: "What is the square root of 144?", o: ["11", "12", "13", "14"], c: 1 },
  { q: "What is 15% of 200?", o: ["25", "30", "35", "40"], c: 1 },
  { q: "How many sides does a heptagon have?", o: ["5", "6", "7", "8"], c: 2 },
  { q: "What is the next prime number after 13?", o: ["15", "16", "17", "18"], c: 2 },
  { q: "If a pizza is cut into 8 slices and you eat 3, what fraction remains?", o: ["3/8", "5/8", "1/2", "2/3"], c: 1 },
  // Food & Drink (expanded)
  { q: "What is the main ingredient in guacamole?", o: ["Tomato", "Avocado", "Lime", "Jalapeño"], c: 1 },
  { q: "Which country invented pizza?", o: ["Greece", "France", "Italy", "Spain"], c: 2 },
  { q: "What is the most consumed beverage in the world after water?", o: ["Coffee", "Tea", "Beer", "Cola"], c: 1 },
  { q: "What is the spice that gives turmeric its yellow colour?", o: ["Curcumin", "Capsaicin", "Piperine", "Lycopene"], c: 0 },
  { q: "In which country did sushi originate?", o: ["China", "Korea", "Japan", "Vietnam"], c: 2 },
  { q: "What does a Michelin star rate?", o: ["Hotels", "Restaurants", "Car services", "Tourist attractions"], c: 1 },
  // Sports (expanded)
  { q: "How many players are on a basketball team on the court?", o: ["4", "5", "6", "7"], c: 1 },
  { q: "In which city were the first modern Olympic Games held?", o: ["Paris", "London", "Athens", "Rome"], c: 2 },
  { q: "What is the maximum score in 10-pin bowling?", o: ["200", "250", "300", "350"], c: 2 },
  { q: "How long is a marathon in kilometres (approx)?", o: ["32 km", "38 km", "42 km", "48 km"], c: 2 },
  { q: "Which country has won the most FIFA World Cups?", o: ["Germany", "Argentina", "Italy", "Brazil"], c: 3 },
  { q: "In tennis, what is the term for a score of 40-40?", o: ["Tie", "Deuce", "Advantage", "Set point"], c: 1 },
];

function pickUnusedQuestions(usedIndices, rng, count = TOTAL_QUESTIONS) {
  let available = QUESTION_BANK.map((_, i) => i).filter((i) => !usedIndices.has(i));
  // If fewer unused questions remain than needed, reset and use full pool
  if (available.length < count) {
    usedIndices = new Set();
    available = QUESTION_BANK.map((_, i) => i);
  }
  // Fisher-Yates shuffle of available indices
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  const picked = available.slice(0, count);
  const newUsed = new Set(usedIndices);
  picked.forEach((i) => newUsed.add(i));
  return { questions: picked.map((i) => QUESTION_BANK[i]), usedIndices: newUsed };
}

export function createTriviaState({ players, rng }) {
  const playerIds = players.map((p) => p.id);
  const scores = new Map();
  playerIds.forEach((id) => scores.set(id, 0));

  const { questions, usedIndices } = pickUnusedQuestions(new Set(), rng);

  return {
    gameType: "trivia",
    status: "question",
    playerIds,
    questions,
    usedIndices,
    questionIndex: 0,
    answers: new Map(),
    scores,
    timer: QUESTION_DURATION,
    questionStartTime: Date.now(),
    triviaRound: 1,
    roundStartScores: new Map(scores),
    roundWinnerId: null,
  };
}

export function handleTriviaAction(state, playerId, action) {
  if (action.kind === "answer") {
    return submitAnswer(state, playerId, action.index);
  }
  return state;
}

function submitAnswer(state, playerId, index) {
  if (state.status !== "question") return state;
  if (typeof index !== "number" || index < 0 || index > 3) return state;
  if (state.answers.has(playerId)) return state;

  const answers = new Map(state.answers);
  answers.set(playerId, { index, timestamp: Date.now() });
  return { ...state, answers };
}

export function allAnswered(state) {
  return state.answers.size >= state.playerIds.length;
}

export function revealTrivia(state) {
  const current = state.questions[state.questionIndex];
  const scores = new Map(state.scores);

  state.answers.forEach(({ index, timestamp }, playerId) => {
    if (index === current.c) {
      const elapsed = (timestamp - state.questionStartTime) / 1000;
      const remaining = Math.max(0, QUESTION_DURATION - elapsed);
      const points = Math.max(100, Math.ceil((remaining / QUESTION_DURATION) * 1000));
      scores.set(playerId, (scores.get(playerId) || 0) + points);
    }
  });

  return { ...state, status: "reveal", scores, timer: REVEAL_DURATION };
}

export function nextTriviaQuestion(state) {
  const nextIndex = state.questionIndex + 1;

  // All questions in this round answered — compute round winner
  if (nextIndex >= state.questions.length) {
    let maxGain = 0;
    let winnerId = null;
    state.scores.forEach((score, id) => {
      const start = state.roundStartScores?.get(id) || 0;
      const gain = score - start;
      if (gain > maxGain) {
        maxGain = gain;
        winnerId = id;
      }
    });
    return {
      ...state,
      status: "round_complete",
      roundWinnerId: winnerId,
      timer: null,  // Host must press "Start Next Set" — no auto-advance
    };
  }

  return {
    ...state,
    status: "question",
    questionIndex: nextIndex,
    answers: new Map(),
    timer: QUESTION_DURATION,
    questionStartTime: Date.now(),
  };
}

export function nextTriviaRound(state, rng) {
  const { questions, usedIndices } = pickUnusedQuestions(state.usedIndices || new Set(), rng);

  return {
    ...state,
    status: "question",
    questions,
    usedIndices,
    questionIndex: 0,
    answers: new Map(),
    timer: QUESTION_DURATION,
    questionStartTime: Date.now(),
    triviaRound: (state.triviaRound || 1) + 1,
    roundStartScores: new Map(state.scores),
    roundWinnerId: null,
  };
}

export function tickTrivia(state) {
  if (state.timer <= 0) return state;
  return { ...state, timer: state.timer - 1 };
}

export function serializeTrivia(state) {
  const current = state.questions[state.questionIndex];
  const result = {
    gameType: "trivia",
    status: state.status,
    questionIndex: state.questionIndex,
    totalQuestions: state.questions.length,
    question: current.q,
    options: current.o,
    timer: state.timer,
    scores: Object.fromEntries(state.scores),
    answerCount: state.answers.size,
    playerCount: state.playerIds.length,
    triviaRound: state.triviaRound || 1,
    roundWinnerId: state.roundWinnerId,
  };

  if (state.status === "reveal") {
    result.correctIndex = current.c;
    result.answers = {};
    state.answers.forEach(({ index }, playerId) => {
      result.answers[playerId] = index;
    });
  }

  return result;
}
