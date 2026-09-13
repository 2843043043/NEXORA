/**
 * videoChat.js
 * ------------------------------------------------------------------
 * Conversational (not structured-report) replies for the "AI Video
 * Call" feature. Unlike mockDiagnosis.js (which returns a WhatsApp-
 * style report with emoji headers), these are short, natural spoken
 * sentences — meant to be heard, not read, since they get played
 * through text-to-speech during a live call.
 * ------------------------------------------------------------------
 */

const GREETINGS = [
  'Namaste! Main Crop Doctor hoon, aapki fasal ki madad ke liye yahan hoon. Bataiye, kya dikkat hai?',
  'Namaste ji! Boliye, aapke paudhe mein kya samasya dikh rahi hai?',
];

const KEYWORD_REPLIES = [
  { match: /daag|blight|jhulsan/, reply: 'Samajh gaya — patto par daag aksar patta jhulsan yaani Early Blight ke lakshan hote hain. Kya aap mujhe patte ki ek photo dikha sakte hain, taaki main pakka bata sakoon?' },
  { match: /safed|fafoond|mildew/, reply: 'Yeh safed fafoondi jaisa lag raha hai. Kya patto par safed powder jaisa dikh raha hai? Photo bhejenge to aur pakka ho jayega.' },
  { match: /keede|kide|insect|pest/, reply: 'Keedon ki samasya lag rahi hai. Kya aap patto ke niche ki taraf bhi dekh sakte hain? Wahan chhote keede aksar chhipe hote hain.' },
  { match: /paani|sinchai|irrigation/, reply: 'Sinchai ke baare mein — zyada paani se jadd sadne ka khatra rehta hai. Mitti chhoo kar dekhiye, agar geeli hai to aaj paani mat dijiye.' },
  { match: /mausam|baarish|weather|rain/, reply: 'Mausam ka dhyan rakhna zaroori hai — agar baarish aane wali hai, to spray ko thodा rok dijiye, warna dawa dho jayegi.' },
  { match: /dhanyavaad|thank|shukriya/, reply: 'Koi baat nahi ji! Khushi hui madad karke. Agar aur koi sawaal ho to zaroor poochiye.' },
];

const FALLBACK_REPLIES = [
  'Samajh gaya. Kya aap mujhe iski ek photo dikha sakte hain? Isse main aur sahi salah de paunga.',
  'Theek hai — thoda aur bataiye, kaunsi fasal hai aur kab se yeh dikkat dikh rahi hai?',
  'Achha. Iske baare mein Krishi Vigyan Kendra se bhi salah lena sahi rahega, lekin main abhi jitna ho sake madad karta hoon — aur bataiye.',
];

let fallbackIndex = 0;

function getMockVideoReply(message, isFirstTurn) {
  if (isFirstTurn) {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  }
  const lower = (message || '').toLowerCase();
  const hit = KEYWORD_REPLIES.find((k) => k.match.test(lower));
  if (hit) return hit.reply;

  const reply = FALLBACK_REPLIES[fallbackIndex % FALLBACK_REPLIES.length];
  fallbackIndex += 1;
  return reply;
}

module.exports = { getMockVideoReply };
