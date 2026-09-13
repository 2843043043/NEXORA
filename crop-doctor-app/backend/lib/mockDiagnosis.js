/**
 * mockDiagnosis.js
 * ------------------------------------------------------------------
 * Demo-mode fallback so the whole project runs and LOOKS fully working
 * even with zero setup — no Anthropic account, no API key, no internet
 * dependency for the AI call itself.
 *
 * server.js uses this automatically whenever ANTHROPIC_API_KEY is
 * missing (or if the real API call fails for any reason, e.g. no wifi
 * during a live demo). Swap in a real key later and the exact same
 * code path calls the real Claude Vision model instead — nothing else
 * in the app needs to change.
 * ------------------------------------------------------------------
 */

const SAMPLE_DIAGNOSES = [
  `Namaste bhai, photo dekh li maine. Yeh patta jhulsan (early blight) jaisa lag raha hai — patto par jo bhoore daag dikh rahe hain, unki wajah se hai. Ghabraiye mat, shuru mein hi pakad liya hai.

Abhi sabse pehle jo patte zyada kharab lag rahe hain unhe tod kar khet se door fenk dijiye, taaki aur na phaile. Agle 2-3 din sinchai thodi kam kar dijiye aur paani seedha jadd mein dijiye, patto par bilkul mat dalna. Copper-based koi fungicide dukaandaar se poochh kar le lijiye, matra wahi confirm kar lena. 7 din baad ek aur photo bhej dijiyega, dekhte hain kaisa sudhaar hua.

Subah jaldi paani de diya kariye taaki din mein patte sookh jaayein, isse fungus kam badhta hai. 🙏

🌡️ Health Score: 48/100
🦠 Disease Risk: High (78%)
🐛 Pest Risk: Low (12%)
💧 Water Stress: Medium
🎯 Suggested Action: Prabhavit patte turant hata kar khet se door fenk dein
📊 Confidence: 87%`,

  `Dekh liya maine photo, yeh safed fafoondi (powdery mildew) hai — bahut common cheez hai, jaldi theek ho jaayegi to tension mat lijiye.

Aaj hi neem tel ko paani mein halka ghol kar spray kar dijiye, subah ya shaam ke waqt karna behtar rahega. Har 3-4 din mein dobara spray karte rahiye. Agar zyada phaile to sulphur-based fungicide dukaandaar/KVK se poochh kar le sakte hain. Paudho ke beech thodi jagah bhi rakhiyega taaki hawa achhe se lage aur namee kam rahe. Ek hafte baad naye patto ki photo bhej dijiyega, dekhte hain safedi kam hui ya nahi.

Waise yeh dikkat mausam badalne par aksar aati hai, isliye zyada chinta wali baat nahi hai. 🙏

🌡️ Health Score: 58/100
🦠 Disease Risk: Medium (52%)
🐛 Pest Risk: Low (10%)
💧 Water Stress: Low
🎯 Suggested Action: Aaj hi neem tel ka halka spray karein
📊 Confidence: 81%`,

  `Bhai, patto par jo yeh nishaan hain woh keede — shayad chusne wale aphids — ka kaam lag raha hai. Shuru mein hi pakad liya, ab aasani se control ho jaayega.

Aaj hi neem tel mein thoda saabun mila kar spray kar dijiye, poore paudhe par achhe se. Patto ke niche ka hissa roz check kariyega, keede aksar wahin chhipe rehte hain. Agar 2-3 din mein farak na dikhe to neem-based ya imidacloprid category ka koi spray KVK se poochh kar le lijiye. Ek hafte baad dobara dekhte hain sankhya kam hui ya nahi.

Aap tension mat lijiye, aisi cheez aksar hoti hai aur control bhi jaldi ho jaati hai. 🙏

🌡️ Health Score: 64/100
🦠 Disease Risk: Low (18%)
🐛 Pest Risk: High (70%)
💧 Water Stress: Low
🎯 Suggested Action: Patto ke niche neem-tel spray turant karein
📊 Confidence: 78%`,

  `Bhai, photo thodi dhundhli aa rahi hai, isliye poore yakeen se kuch nahi keh paunga — galat salah dene se behtar hai saaf saaf bata dena.

Jo patte thoda kharab lag rahe hain unhe abhi ke liye alag kar dijiye taaki rog agar hai bhi to na phaile, aur jab tak clear na ho tab tak koi dawa mat dalna. Ho sake to ek aur photo paas se, achhi roshni mein (dhoop mein ya bulb ke neeche) bhej dijiye — patte ko seedha camera ke saamne rakh kar khinchiyega.

Koi baat nahi, aise hota hai — ek baar aur try kar lete hain. 🙏

🌡️ Health Score: 70/100
🦠 Disease Risk: Medium (40%)
🐛 Pest Risk: Low (15%)
💧 Water Stress: Low
🎯 Suggested Action: Ek saaf, paas se li gayi photo dobara bhejein
📊 Confidence: 40%`,
];

let lastIndex = -1;

function getMockDiagnosis({ text }) {
  let index;
  const lower = (text || '').toLowerCase();

  if (/saaf nahi|blur|clear nahi|dhundhla/.test(lower)) {
    index = 3;
  } else {
    do {
      index = Math.floor(Math.random() * (SAMPLE_DIAGNOSES.length - 1));
    } while (index === lastIndex);
  }

  lastIndex = index;
  return SAMPLE_DIAGNOSES[index];
}

/** Demo-mode follow-up comparison (used when there's no real API key). */
const FOLLOWUP_VERDICTS = ['IMPROVING', 'STABLE', 'WORSE'];
const FOLLOWUP_TEXT = {
  IMPROVING: `🟢 Improving — Treatment kaam kar raha hai!
Nayi photo mein daag pehle se kam dikh rahe hain. Isi treatment ko 5-7 din aur jaari rakhein, phir dobara check karein.`,
  STABLE: `🟡 Stable — Halka sudhaar hai, par treatment adjust karna hoga.
Sthiti zyada badli nahi hai. Dawa ki matra thodi badha kar 5 din aur try karein, phir dobara photo bhejein.`,
  WORSE: `🔴 Getting worse — Ab expert salah zaroori hai.
Rog phaila hua lag raha hai. Turant apne nazdiki Krishi Vigyan Kendra (KVK) se sampark karein ya kisi agri-expert ko yeh photos dikhayein.`,
};

function getMockFollowup() {
  const verdict = FOLLOWUP_VERDICTS[Math.floor(Math.random() * FOLLOWUP_VERDICTS.length)];
  return { verdict, aiText: FOLLOWUP_TEXT[verdict] };
}

module.exports = { getMockDiagnosis, getMockFollowup };
