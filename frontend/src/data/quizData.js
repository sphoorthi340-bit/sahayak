// ─── STATIC DRILL QUIZ DATA ──────────────────────────────
// 5 questions per hazard, 4 options each, runs fully offline.

const QUIZ_DATA = {
  flood: [
    {
      q: "What should you do FIRST when you hear a flood warning?",
      options: ["Move to higher ground immediately", "Try to save belongings", "Wait and watch the water level", "Go to the riverbank to check"],
      answer: 0,
    },
    {
      q: "Which of these is the SAFEST place during a flood?",
      options: ["Basement of a building", "Upper floor of a strong building", "Under a bridge", "Near a drainage canal"],
      answer: 1,
    },
    {
      q: "What should you AVOID doing during a flood?",
      options: ["Drinking clean stored water", "Listening to radio alerts", "Walking through floodwater", "Staying on high ground"],
      answer: 2,
    },
    {
      q: "How deep must floodwater be to knock an adult down?",
      options: ["Waist deep (3 feet)", "Ankle deep (6 inches)", "Knee deep (2 feet)", "Chest deep (4 feet)"],
      answer: 2,
    },
    {
      q: "After a flood, when is it safe to return home?",
      options: ["As soon as rain stops", "When water starts receding", "Only after authorities declare it safe", "After 1 hour"],
      answer: 2,
    },
  ],

  cyclone: [
    {
      q: "What should you do when a cyclone warning is issued?",
      options: ["Go outside to watch", "Secure doors, windows, stay indoors", "Drive to the coast", "Climb to the rooftop"],
      answer: 1,
    },
    {
      q: "Where is the SAFEST place inside a house during a cyclone?",
      options: ["Near large windows", "On the rooftop", "An interior room away from windows", "In the garage"],
      answer: 2,
    },
    {
      q: "What should you stock up on BEFORE a cyclone?",
      options: ["Fireworks", "Water, food, torch, radio, medicine", "Gardening tools", "Only mobile charger"],
      answer: 1,
    },
    {
      q: "The calm 'eye' of the cyclone means:",
      options: ["The cyclone is over", "The worst is still coming — stay sheltered", "It's safe to go outside", "The cyclone changed direction"],
      answer: 1,
    },
    {
      q: "After a cyclone passes, you should:",
      options: ["Touch fallen power lines to check", "Wait for an official all-clear signal", "Immediately start driving", "Go to the beach"],
      answer: 1,
    },
  ],

  landslide: [
    {
      q: "What is a common warning sign of a landslide?",
      options: ["Clear sunny weather", "Cracks appearing in the ground or walls", "Birds singing loudly", "Calm river water"],
      answer: 1,
    },
    {
      q: "During heavy rain on a hillside, you should:",
      options: ["Stay and watch from the slope", "Move away from the slope immediately", "Dig a trench on the slope", "Park your vehicle on the hill"],
      answer: 1,
    },
    {
      q: "If you hear a rumbling sound from a hill, what should you do?",
      options: ["Investigate the sound", "Run away from the path of the slide", "Stay still and wait", "Move downhill slowly"],
      answer: 1,
    },
    {
      q: "Which area is MOST dangerous during a landslide?",
      options: ["Flat open ground far from hills", "The base of a steep slope", "A concrete rooftop", "Inside a well-built house on flat land"],
      answer: 1,
    },
    {
      q: "After a landslide, the biggest danger is:",
      options: ["Sunburn", "Follow-up slides from the same slope", "Loud noise", "Cold weather"],
      answer: 1,
    },
  ],

  heatwave: [
    {
      q: "What is the MOST important thing during a heatwave?",
      options: ["Drink lots of water regularly", "Exercise outdoors", "Wear dark tight clothes", "Eat spicy food"],
      answer: 0,
    },
    {
      q: "When should you AVOID going outside during a heatwave?",
      options: ["Early morning (6–8 AM)", "Late evening (6–8 PM)", "Peak afternoon (12–3 PM)", "Night time"],
      answer: 2,
    },
    {
      q: "Signs of heatstroke include:",
      options: ["Feeling cold and shivering", "Hot dry skin, confusion, fast pulse", "Runny nose and sneezing", "Itchy eyes"],
      answer: 1,
    },
    {
      q: "If someone faints from heat, you should:",
      options: ["Give them hot tea", "Move them to shade and cool them with water", "Make them run", "Ignore and wait"],
      answer: 1,
    },
    {
      q: "Which drink should you AVOID during a heatwave?",
      options: ["Water", "ORS (oral rehydration salts)", "Alcohol", "Buttermilk / lassi"],
      answer: 2,
    },
  ],
};

export default QUIZ_DATA;
