/**
 * Messages de repli localisés pour les médias entrants que le bot ne traite pas
 * (audio, document, sticker, vidéo) ou quand le téléchargement/vision d'une
 * image échoue. Purs et testables : pas d'I/O.
 */
import type { BotLanguage } from '../models/BotConfig.model';

export type IncomingMediaType = 'image' | 'audio' | 'document' | 'sticker' | 'video';
type LangGroup = 'ar' | 'fr' | 'en' | 'darija';

const FALLBACK: Record<LangGroup, Record<IncomingMediaType, string>> = {
  fr: {
    image: "J'ai bien reçu ton image mais je n'ai pas pu l'ouvrir. Tu peux me décrire en quelques mots ce qu'elle montre ?",
    audio: "Merci 🙏 ! Je ne peux pas écouter les vocaux — écris-moi ta demande en message texte et je m'en occupe tout de suite 😊",
    document: "Je ne peux pas encore lire les documents. Tu peux me résumer en texte ce dont tu as besoin ?",
    sticker: "😊 Dis-moi en quoi je peux t'aider !",
    video: "Je ne peux pas encore regarder les vidéos. Tu peux m'expliquer en texte ?",
  },
  en: {
    image: "I got your image but couldn't open it. Could you tell me in a few words what it shows?",
    audio: "Thanks 🙏! I can't listen to voice notes — please send your request as a text message and I'll help right away 😊",
    document: "I can't read documents yet. Could you summarize what you need in text?",
    sticker: '😊 Tell me how I can help!',
    video: "I can't watch videos yet. Could you explain in text?",
  },
  ar: {
    image: 'وصلتني الصورة لكن ما قدرتش نفتحها. ممكن توصفلي بالكلام شنو كاينة فيها؟',
    audio: 'شكرا 🙏! ما نقدرش نسمع الرسائل الصوتية — اكتبلي طلبك برسالة نصية ونعاونك دغيا 😊',
    document: 'ما زال ما نقدرش نقرا الملفات. ممكن تلخصلي بالكتابة شنو محتاج؟',
    sticker: '😊 قوليا كيفاش نقدر نعاونك!',
    video: 'ما زال ما نقدرش نشوف الفيديوهات. ممكن تشرحلي بالكتابة؟',
  },
  darija: {
    image: 'وصلاتني التصويرة ولكن ما قدرتش نحلها. واش تقدر توصفلي بالكلمات شنو كاين فيها؟',
    audio: 'شكرا 🙏! ما كنقدرش نسمع الرسائل الصوتية — كتب ليا طلبك برسالة نصية وغادي نعاونك دابا 😊',
    document: 'مازال ما كنقدرش نقرا الوثائق. واش تقدر تلخصلي بالكتابة شنو بغيتي؟',
    sticker: '😊 قولي كيفاش نقدر نعاونك!',
    video: 'مازال ما كنقدرش نتفرج فالفيديوهات. واش تقدر تشرحلي بالكتابة؟',
  },
};

function group(lang: BotLanguage): LangGroup {
  if (lang === 'fr') return 'fr';
  if (lang === 'en') return 'en';
  if (lang === 'ar') return 'ar';
  return 'darija'; // darija_ma / darija_dz / darija_tn
}

export function mediaFallbackMessage(lang: BotLanguage, type: IncomingMediaType): string {
  return FALLBACK[group(lang)][type];
}

/** Texte injecté à côté de l'image quand le client n'a pas mis de légende. */
export function imagePromptHint(lang: BotLanguage): string {
  return {
    fr: '(Le client a envoyé une image. Décris ce que tu vois et aide-le.)',
    en: '(The customer sent an image. Describe what you see and help them.)',
    ar: '(أرسل العميل صورة. صف ما تراه وساعده.)',
    darija: '(العميل صيفط تصويرة. شوف فيها وعاونو.)',
  }[group(lang)];
}
