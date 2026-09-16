import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle } from "docx";
import * as fs from "fs";
import * as path from "path";

// Utility formatting functions for document builders
function createHeaderParagraph(text: string): Paragraph {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    keepNext: true,
  });
}

function createSubHeaderParagraph(text: string): Paragraph {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 180, after: 80 },
    keepNext: true,
  });
}

function createBodyParagraph(text: string, bold = false, size = 22): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({
        text: text,
        bold: bold,
        size: size,
        font: "Segoe UI",
      }),
    ],
  });
}

function createBulletPoint(text: string, count = 1): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: 720 },
    children: [
      new TextRun({
        text: "•  " + text,
        font: "Segoe UI",
        size: 22,
      }),
    ],
  });
}

function createNumberedPoint(num: number, text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: 720 },
    children: [
      new TextRun({
        text: `${num}. ` + text,
        font: "Segoe UI",
        size: 22,
      }),
    ],
  });
}

function createRulePoint(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: 1080 },
    children: [
      new TextRun({
        text: "✔  " + text,
        italics: true,
        font: "Segoe UI",
        size: 22,
      }),
    ],
  });
}

async function buildOfficerGuide() {
  console.log("Building Officer User Guide...");

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // MAIN TITLE
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 360, after: 180 },
            children: [
              new TextRun({
                text: "මයි නියගම - පරිශීලක සහ පද්ධති මාර්ගෝපදේශය",
                bold: true,
                size: 36,
                font: "Segoe UI Semibold",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 360 },
            children: [
              new TextRun({
                text: "ප්‍රාදේශීය ලේකම් කාර්යාලයීය නිලධාරී කළමනාකරණ පරිපාලන පද්ධතිය (My Niyagama System)",
                italics: true,
                size: 20,
                font: "Segoe UI",
              }),
            ],
          }),

          // DIVIDER LINE
          new Paragraph({
            spacing: { before: 120, after: 240 },
            children: [
              new TextRun({
                text: "_________________________________________________________________________________",
                color: "94a3b8",
                size: 16,
              }),
            ],
          }),

          // PURPOSE
          createHeaderParagraph("පද්ධතියේ ප්‍රධාන අරමුණ (Purpose of the System)"),
          createBodyParagraph(
            "‘මයි නියගම (My Niyagama)’ යනු නියගම ප්‍රාදේශීය ලේකම් කාර්යාලයේ රාජකාරි, පරිපාලන සහ සන්නිවේදන ක්‍රියාවලීන් වඩාත් කාර්යක්ෂම, විනිවිදභාවයෙන් යුත්, කඩදාසි රහිත සහ ඩිජිටල්කරණය වූ පරිසරයක් තුළ සිදු කිරීම සඳහා සැකසුණු අති නවීන අභ්‍යන්තර වෙබ් පද්ධතියකි.",
            false
          ),
          createBodyParagraph(
            "මෙහි ප්‍රධාන අරමුණ වනුයේ නිලධාරීන්ගේ දෛනික පැමිණීම, නිල සම්බන්ධතා, රාජකාරි පැවරුම්, දිනපොත සටහන් කිරීම, නිවාඩු අයදුම් කිරීම්, සම්පත් වෙන් කිරීම්, ඵලදායිතා කව පැවැත්වීම සහ දෙපාර්තමේන්තු සැලසුම් එකම ජාලයකින් කළමනාකරණය කරමින් වඩාත් ආයතනික සම්බන්ධීකරණයක් ඇති කිරීමයි.",
            false
          ),

          // LOGIN SECTION
          createHeaderParagraph("1. පද්ධතියට ඇතුළු වීම (System Authentication / Login)"),
          createBodyParagraph(
            "පද්ධතියේ දත්ත ආරක්ෂාව තහවුරු කිරීමට සහ සෑම නිලධාරියෙකුටම තමාට වෙන්කර ඇති පහසුකම් ලබා ගැනීමට මුලින්ම පද්ධතියට සාර්ථකව පිවිසිය යුතුය.",
            false
          ),
          createSubHeaderParagraph("ප්‍රවේශ තොරතුරු (Account Credentials):"),
          createBulletPoint("ප්‍රවේශ නාමය (Username): ඔබගේ ජාතික හැඳුනුම්පත් අංකය (National Identity Card Number) භාවිතා කරන්න."),
          createBulletPoint("පෙරනිමි මුරපදය (Default Password): 1234 භාවිතා කරන්න."),

          createSubHeaderParagraph("අනුගමනය කළ යුතු ක්‍රියාදාමයන් සහ නීති (Actions & System Rules):"),
          createBulletPoint("ප්‍රථම වරට ඇතුළු වූ වහාම, ආරක්ෂක හේතූන් මත ඔබගේ භාවිත නාමය (Username) සහ මුරපදය (Password) වඩාත් ආරක්ෂිත එකක් ලෙස වෙනස් කර ගත යුතුය. (Profile 👤 > Edit Profile / Safety Settings වෙත යන්න)."),
          createBulletPoint("ඔබගේ රාජකාරි දත්තයන්හි රහස්‍යභාවය පවත්වා ගැනීම සඳහා සේවා මුරයකින් අනතුරුව හෝ ඔබගේ රාජකාරි පරිගණකයෙන් බැහැරව යාමේදී සැමවිටම පද්ධතියෙන් ඉවත් වීමට (Logout) වගබලා ගන්න."),

          // PHONE BOOK SECTION
          createHeaderParagraph("2. දුරකථන නාමාවලිය (Phone Book & Contacts)"),
          createBodyParagraph(
            "කාර්යාලයේ සේවය කරන සියලුම නිලධාරීන්ගේ නිල සම්බන්ධතා තොරතුරු සහ ලිපිනයන් එක් ක්ලික් කිරීමකින් සොයා ගැනීමට මෙම මෙවලම උපකාරী වේ.",
            false
          ),
          createSubHeaderParagraph("අනුගමනය කළ යුතු ක්‍රියාදාමයන් (Actions & Settings):"),
          createBulletPoint("සියලුම නිලධාරීන් පද්ධතියට පළමු ඇතුලත් වීමෙන් පසුව තමන්ගේ දුරකථන අංකය සහ ලිපිනය යාවත්කාලීන කිරීම අනිවාර්ය වේ. (පියවර: Profile 👩‍💼 > Official Context > Official Phone සහ Residential Address ඇතුළත් කරන්න)."),
          createBulletPoint("ඕනෑම නිලධාරියෙකුගේ සම්බන්ධතා තොරතුරු සෙවීම සදහා Phone Book 📔 වෙත පිවිස, අදාළ නිලධාරියාගේ නම හෝ තනතුර ඇතුළු කර සෙවුම් තීරුව භාවිතා කරන්න (Search)."),

          // GALLERY SECTION
          createHeaderParagraph("3. ඡායාරූප ගැලරිය (Gallery & Media Archive)"),
          createBodyParagraph(
            "කාර්යාලයේ විශේෂ අවස්ථාවන්වල, උත්සව, සහ කොට්ඨාසයේ සංවිධානය කරනු ලබන රාජකාරි වැඩසටහන්වල මතකයන් සහ ඡායාරූප විදිමත්ව සුරක්ෂිත කිරීම සහ අනෙකුත් නිලධාරීන් අතර බෙදා ගැනීම මෙහි අරමුණයි.",
            false
          ),
          createSubHeaderParagraph("අනුගමනය කළ යුතු ක්‍රියාදාමයන් (Actions):"),
          createBulletPoint("නව ඇල්බමයක් සැකසීම: Gallery 🖼️ > Create New Album වෙත පිවිසෙන්න."),
          createRulePoint("Archive Title සදහා එම රාජකාරි වැඩසටහනෙහි පැහැදිලි නම ඇතුලත් කරන්න."),
          createRulePoint("Narrative Description සදහා වැඩසටහන පිළිබඳව ඉතා කෙටි හැදින්වීමක් පමණක් යොදන්න (වැදගත්: දිනය, ස්ථානය, සහභාගී වූ නිලධාරීන් පිළිබඳව හැඳින්වීම් සහ විශේෂයෙන් ස්තූති කිරීම් ආදිය ඇතුලත් කිරීමෙන් වළකින්න)."),
          createBulletPoint("ඇල්බමය තුලට ඡායාරූප එක් කිරීම: Gallery 🖼️ වෙත ගොස් ඔබ සකස් කළ ඇල්බමය තෝරා විවෘත කරන්න. විවෘත වූ පසු එහි ඉහලින් ඇති ඊතල සළකුණ (Upload Icon) භාවිතා කර ඔබගේ දුරකථනයේ හෝ පරිගණකයේ ඇති සුදුසු ඡායාරූප තෝරා ඇතුලත් කරන්න."),

          createSubHeaderParagraph("විශේෂ කොන්දේසි සහ රෙගුලාසි (Terms & Restrictions):"),
          createNumberedPoint(1, "එක් ඇල්බමයක් සදහා උපරිම ඡායාරූප 12 ක් සහ අවම ඡායාරූප 5ක් ඇතුලත් කල යුතුය."),
          createNumberedPoint(2, "සියලුම ඡායාරූප ඉහළ විභේදනයක් සහිත ඉතා සුපැදිලි ඡායාරූප (High Resolution) විය යුතුය. අපැහැදිලි ඡායාරූප පද්ධතිය මගින් ස්වයංක්‍රීයව ඉවත් කරනු ලැබේ."),
          createNumberedPoint(3, "එක් සුවිශේෂී වැඩසටහනක් හෝ උත්සවයක් සදහා සකස් කල හැක්කේ එක් ඇල්බමයක් පමණි."),

          // SECTION: CIRCLE (කව)
          createHeaderParagraph("4. ඵලදායිතා කව මොඩියුලය (Circles Module / Task Strategy groups)"),
          createBodyParagraph(
            "ඵලදායිතා කව යනු කාර්යාලයීය නිලධාරීන් ඵලදායිතාව සහ ගුණාත්මකභාවය ඉහළ නැංවීම සඳහා ඒකාබද්ධ උපායමාර්ගික කණ්ඩායම් ලෙස එක්වී කටයුතු කිරීමට සකස් කරන ලද විශේෂ මොඩියුලයකි.",
            false
          ),
          createSubHeaderParagraph("අනුගමනය කළ යුතු ක්‍රියාදාමයන් (Actions):"),
          createBulletPoint("ඵලදායිතා කවයක් පිහිටුවීම: Circles 🌐 මොඩියුලය වෙත පිවිස 'Form New Circle' හෝ 'Establish Circle' බොත්තම ක්ලික් කරන්න. එහිදී ඵලදායිතා කවය සඳහා කැමති ලාංඡනයක් (Emoji Logo), නම (Circle Name) සහ ඔවුන්ගේ මෙහෙවර ප්‍රකාශය (Mission Statement) ඇතුළත් කරන්න."),
          createBulletPoint("ව්‍යාපෘති සහ රාජකාරී නිර්මාණය: තෝරාගත් ඵලදායිතා කවයක් අභ්‍යන්තරයේ කව සාමාජිකයන් සඳහා නව ව්‍යාපෘති (Projects) සහ ප්‍රමුඛතා මට්ටම සහිත විශේෂිත රාජකාරී (Tasks/Targets with priority labels) පැවරිය හැක."),
          createBulletPoint("ප්‍රවර්ධන ප්‍රස්ථාර සහ ප්‍රගතිය: පද්ධතිය මඟින් එක් එක් ඵලදායිතා කවයන්හි දක්ෂතා මට්ටම සහ ලකුණු (Radar Scoring Charts - ReRadar Graphs) මඟින් සජීවීව නිරීක්ෂණය කරන බැවින් සියලු කාර්යයන් නියමිත වේලාවට යාවත්කාලීන කිරීම අනිවාර්ය වේ."),

          // SECTION: ATTENDANCE CALENDAR
          createHeaderParagraph("5. පැමිණීමේ දින දර්ශනය (Historical Attendance Calendar)"),
          createBodyParagraph(
            "සෑම නිලධාරියෙකුගේම මාසික පැමිණීම් වාර්තාව සහ දෛනික රැකියා ඉතිහාසය පූර්ණ විනිවිදභාවයකින් යුතුව නිරීක්ෂණය කළ හැකි ද්වාරයකි.",
            false
          ),
          createSubHeaderParagraph("භාවිතය සහ වර්ණ කේතනයන් (Calendar Statuses):"),
          createBulletPoint("පැමිණීමේ දින දර්ශනය (Attendance Calendar 📅) වෙතින් ඔබගේ වර්තමාන සහ පෙර මාසයන්හී දෛනික පැමිණීම් ඉතිහාසය දෘශ්‍යමය ලෙස පිරික්සිය හැක."),
          createBulletPoint("පද්ධතියේ වර්ණ කේතනයන් හඳුනාගැනීම:"),
          createRulePoint("PRESENT: කොළ පැහැයෙන් දැක්වෙන්නේ ඔබ නියමිත පරිදි පැමිණීම සටහන් කළ දින වේ."),
          createRulePoint("ABSENT: රතු පැහැයෙන් දැක්වෙන්නේ පැමිණීම සටහන් කර නොමැති දින වේ."),
          createRulePoint("LEAVE: නිල් පැහැයෙන් දැක්වෙන්නේ නිල වශයෙන් නිවාඩු අනුමත වූ දින වේ."),
          createRulePoint("HALF-DAY: තැඹිලි හෝ කහ පැහැයෙන් අඩ දින රාජකාරී දින සටහන් වේ."),

          // SECTION: OUT ELIGIBILITY
          createHeaderParagraph("6. බැහැර වීමේ සුදුසුකම් සීමාවන් (Out Eligibility Constraints)"),
          createBodyParagraph(
            "නිලධාරියෙකු දෛනික රාජකාරී අවසන් කර ආයතනයෙන් නික්ම යාමට සුදුසුකම් ලබන නිවැරදි වේලාව සජීවීව තීරණය කරනු ලබන්නේ මෙම ස්වයංක්‍රීය බුද්ධිමත් ඇල්ගොරිතමය මඟිනි.",
            false
          ),
          createSubHeaderParagraph("ප්‍රධාන නීති සහ සහන කාල සීමාවන් (Core Rules & Constraints):"),
          createNumberedPoint(1, "දෛනික සේවා මුරය: සේවා මුරයක සම්පූර්ණ කාලය පැය 7යි විනාඩි 45ක් ලෙස සීමා වේ (නිල රාජකාරි කාලය පෙ.ව. 08:30 සිට ප.ව. 16:15 දක්වා වේ)."),
          createNumberedPoint(2, "පෙර හෝ වේලාසන පැමිණීම: යම් නිලධාරියෙකු පෙ.ව. 08:15 හෝ ඊට පෙර පැමිණීම සටහන් කළහොත් (Check-In), ඔහුට ප.ව. 16:00 වන විට නිල වශයෙන් කාර්යාලයෙන් බැහැරව යා හැක (Out Eligibility Time)"),
          createNumberedPoint(3, "සහන කාලය (Grace Period): පෙ.ව. 08:15 සිට පෙ.ව. 08:30 දක්වා වූ සහන කාලය තුළ පැමිණීම සටහන් කළහොත්, බැහැර යා හැකි වේලාව ප.ව. 16:15 වේ."),
          createNumberedPoint(4, "ප්‍රමාද වී පැමිණීම (Late Check-In & Push Back Rule): පෙ.ව. 08:30 පසුවී ප්‍රමාද වන සෑම විනාඩියක් සදහාම, ඔබ බැහැර යා හැකි වේලාව ද ඒ හා සමාන විනාඩි ගණනකින් ඉදිරියට තල්ලු වේ! (උදා: පෙ.ව 08:45 ට පැමිණීම සටහන් කල හොත් බැහැර වීමේ සුදුසුකම ලබන්නේ ප.ව. 16:30 ටය. මෙය පද්ධතිය මඟින් සපුරාලිය යුතු දැඩි රීතියකි)."),
          createNumberedPoint(5, "අඩ දින සහ ලුහු නිවාඩු සීමාවන් (Half Day & Short Leave Thresholds):"),
          createRulePoint("අඩ දින (Half Day) සේවය තහවුරු කිරීමට දෛනික සේවාවෙන් අඩක් (පැය 3යි විනාඩි 52ක්) සම්පූර්ණ විය යුතුය. එම වේලාව පසු වූ වහාම අඩ දිනක් ලෙස සටහන් වේ."),
          createRulePoint("ලුහු නිවාඩු (Short Leave) ශේෂය සටහන් කිරීමට, ඔබේ දෛනික නික්මයාමට නියමිත වේලාවට පෙර පැය 2ක උපරිමයකට යටත් විය යුතුය."),
          createBulletPoint("සජීවී ගණන: ඔබගේ උපකරණ පුවරුවේ ඇති 'Out Eligibility Countdown Clock' මඟින් ඔබ නිල වශයෙන් නික්ම යාමට සුදුසුකම් ලැබීමට තව කොපමණ පැය, විනාඩි, තත්පර ගණනක් ඉතිරිව ඇත්දැයි සජීවීව පෙන්වනු ලබයි."),

          // SECTION: EXECUTIVE PRESENCE (TODAY)
          createHeaderParagraph("7. විධායක නිලධාරීන්ගේ පැමිණීම (Executive Presence Today)"),
          createBodyParagraph(
            "කාර්යාලයේ ඉහළ කළමනාකාරීත්වයේ විධායක නිලධාරීන් (ප්‍රාදේශීය ලේකම්, සහකාර ප්‍රාදේශීය ලේකම්, ගණකාධිකාරී, ප්‍රධාන ලිපිකරු ආදී) අද දින රාජකාරී සඳහා කාර්යාලය තුළ සිටීද යන්න සියලුම නිලධාරීන්ට සජීවීව පෙන්වන දර්ශකයකි.",
            false
          ),
          createSubHeaderParagraph("තත්ත්ව ලකුණු (Live Status Signals):"),
          createBulletPoint("AVAILABLE (කොළ පැහැති ලක්ෂ්‍යය): අදාළ විධායක නිලධාරියා කාර්යාල පරිශ්‍රයේ සිටී (In-Office). ලිපි ලේඛන සහ අත්සන් ලබාගැනීමට මෙමඟින් නිලධාරීන්ට නිවැරදි මඟ පෙන්වීම් සපයයි."),
          createBulletPoint("UNAVAILABLE (රතු පැහැති ලක්ෂ්‍යය): අදාළ විධායක නිලධාරියා කොට්ඨාසයේ විශේෂ ක්ෂේත්‍ර රාජකාරියක, රැස්වීමක හෝ නිවාඩු ලබා සිටී."),
          createBulletPoint("OFFLINE (අළු පැහැති ලක්ෂ්‍යය): සන්නිවේදනයෙන් බැහැරව සිටී."),

          // SECTION: MARK UNAVAILABILITY
          createHeaderParagraph("8. නොපැමිණීම කලින් සටහන් කිරීම (Mark Unavailability)"),
          createBodyParagraph(
            "යම් දිනයක හදිසි පුද්ගලික අවශ්‍යතාවයක්, බාහිර පුහුණුවක් හෝ වෙනත් විශේෂ රාජකාරියක් හේතුවෙන් කාර්යාල රාජකාරි සඳහා පැමිණීමට නොහැකි බව කලින්ම සටහන් කර කළමනාකරණය දැනුවත් කිරීමේ මෙවලමකි.",
            false
          ),
          createSubHeaderParagraph("අනුගමනය කළ යුතු ක්‍රියාදාමයන් (Actions):"),
          createBulletPoint("පැමිණීමට නොහැකි බව සටහන් කිරීම: ඔබගේ උපකරණ පුවරුවේ ඇති 'Mark Unavailability' හෝ 'නොපැමිණීම සටහන් කරන්න' බොත්තම ක්ලික් කරන්න."),
          createBulletPoint("අවශ්‍ය තොරතුරු සැපයීම:"),
          createRulePoint("දිනය (Unavailability Date) සටහන් කරන්න."),
          createRulePoint("නොපැමිණෙන කාලය තෝරන්න (Slot Selection: FULL - මුළු දවසම, AM - පෙරවරු භාගය පමණක්, PM - පස්වරු භාගය පමණක්)."),
          createRulePoint("සාධාරණ හේතුව හෝ රාජකාරී ස්වභාවය විස්තරාත්මකව ඇතුළත් කරන්න (Reason for unavailability)."),
          createBulletPoint("මෙය සිදුකිරීම මඟින් කාර්යාලීය අනෙකුත් පොදු සම්පත් බෙදාදීම සහ රාජකාරි පැවරීම් බාධාවකින් තොරව කළමනාකරණය කිරීමට කළමනාකාරීත්වයට ඉහළ සහායක් ලැබේ."),

          // OFFICIAL JOURNAL SECTION
          createHeaderParagraph("9. රාජකාරි දිනපොත (Official Journal)"),
          createBodyParagraph(
            "රාජකාරි දිනපොත නිලධාරියා සිදුකරන දෛනික රාජකාරී ප්‍රගතිය වාර්තා කිරීමට උපකාරී වේ. ඔබගේ දහඩිය මහන්සිය ආයතනයට විනිවිද පෙනෙන සේ සටහන් කරන්න.",
            false
          ),
          createSubHeaderParagraph("අනුගමනය කළ යුතු ක්‍රියාදාමයන් (Actions):"),
          createBulletPoint("ඔබගේ මුල් පිටුවේ ඇති 'Quick Journal' මෙවලම මඟින් හෝ 'Official Journal 📓' වෙත පිවිස දිනපතා සිදුකළ සුවිශේෂී රාජකාරීන් සටහන් කළ හැක."),
          createBulletPoint("සෑම සති අන්තයකම සතිපතා වාර්තාවක් සම්පූර්ණ කිරීම රාජකාරි පිළිවෙලක් ලෙස අතිශය වැදගත් වේ."),

          // LEAVE SECTION
          createHeaderParagraph("10. නිවාඩු මොඩියුලය (Leave Management Module)"),
          createBodyParagraph(
            "නිලධාරීන්ගේ නිවාඩු අයදුම් කිරීම, අනුමත කිරීම් ලුහුබැඳීම සහ වර්ෂය අවසානයේ ශේෂ තොරතුරු පිරික්සුම පූර්ණ ඩිජිටල් ක්‍රමවේදයකට ක්‍රියාත්මක වේ.",
            false
          ),
          createSubHeaderParagraph("ප්‍රධාන කරුණු සහ නිවාඩු සීමාවන්:"),
          createBulletPoint("සෑම නිලධාරියෙකුටම වාර්ෂිකව හිමි උපරිම නිවාඩු ප්‍රමාණය 42 කි."),
          createBulletPoint("නිවාඩු අයදුම් කිරීම: 'My Leave 🏖️' උපකරණ පුවරුවෙන් නිවාඩු ආකෘතිය ඉදිරිපත් කරන්න. නිවාඩු කාණ්ඩය, කාල සීමාව, සහ නිවාඩු ලබා ගැනීමේ සාධාරණ හේතුව සඳහන් කරන්න."),
          createBulletPoint("සාමාන්‍ය නිවාඩු (Casual Leave) සඳහා අවම වශයෙන් දින 2කට පෙර කල්තියා අයදුම් කිරීමට වගබලා ගන්න."),

          // DEPARTMENT MAPPING SECTION
          createHeaderParagraph("11. දෙපාර්තමේන්තු සැලසුම (Department Mapping / Office Master Plan)"),
          createBodyParagraph(
            "සියලුම නිලධාරීන්ට මෙන්ම කාර්යාලයට පැමිණෙන පුද්ගලයන් හට කාර්යාල ආසන පිරිසැලසුම (Desk Mapping) සහ අංශයන්හි පිහිටීම පහසුවෙන් හඳුනාගත හැකි සිතියමකි.",
            false
          ),
          createSubHeaderParagraph("ක්‍රියාකාරකම් සහ භාවිතය:"),
          createBulletPoint("පද්ධතියේ 'Map 🗺️' මඟින් දෙපාර්තමේන්තුවේ එක් එක් අංශයන්හි මේස සහ ඒවායෙහි අනුයුක්ත කර ඇති නිලධාරී තොරතුරු දෘශ්‍ය සිතියමකින් බලාගත හැක."),
          createBulletPoint("සියලු සැලසුම් අදාළ අංශ ප්‍රධානීන් විසින් සත්‍ය තොරතුරු මත සකස් කරනු ලැබ ඇත."),

          // RESOURCE BOOKING
          createHeaderParagraph("12. සම්පත් වෙන් කිරීම (Resource Booking)"),
          createBodyParagraph(
            "කාර්යාලයීය පොදු වාහන, ශ්‍රවණාගාර හෝ නිල රැස්වීම් ශාලා කලින් වෙන් කරවා ගනිමින් කාර්යාල කටයුතු වඩාත් සුමටව සංවිධානය කිරීමට ඇති පහසුකමකි.",
            false
          ),
          createSubHeaderParagraph("ක්‍රියාකාරකම් සහ නීති:"),
          createBulletPoint("රාජකාරි අවශ්‍යතාවයක් වෙනුවෙන් සම්පත් හෝ වාහන වෙන්කරවා ගැනීමට 'Booking 🚐' වෙත පිවිස ඉල්ලුම්පතක් යොමු කරන්න."),
          createBulletPoint("බොහෝ සම්පත් මුලින් අයදුම් කරනු ලබන පදනම (First-Come, First-Served) මත අදාළ බලධාරීන් විසින් අනුමත කරනු ලැබේ."),

          // PUBLIC DASHBOARD STATUS SYNC
          createHeaderParagraph("13. සජීවී පොදු තොරතුරු යාවත්කාලීන කිරීම (Public Dashboard Status)"),
          createBodyParagraph(
            "සෑම නිලධාරියෙකුගේම වත්මන් රාජකාරි තත්ත්වය (කාර්යාලය තුල සිටීද, ක්ෂේත්‍ර රාජකාරි සඳහා බැහැරවී තිබේද, සේවයෙන් බැහැරවී තිබේද යන්න) ආයතනයේ පොදු තොරතුරු පුවරු තිරයේ (Public Dashboard System) සජීවීව ප්‍රදර්ශනය කරනු ලබයි.",
            false
          ),
          createSubHeaderParagraph("යාවත්කාලීන කිරීමේ උපදෙස්:"),
          createBulletPoint("ඔබගේ වත්මන් රාජකාරි තත්ත්වය සැමවිටම නිවැරදිව පවත්වා ගැනීමට 'Dashboard Status 📡' බොත්තම ක්ලික් කරන්න."),
          createBulletPoint("තෝරාගත හැකි තත්ත්වයන් (Status Levels):"),
          createBulletPoint("     - AVAILABLE (ශාලාවේ සිටී / In-Office)"),
          createBulletPoint("     - FIELD (ක්ෂේත්‍ර රාජකාරියක නිරත වේ - Field Duty)"),
          createBulletPoint("     - MEETING (රැස්වීමක සිටී / Busy in Meeting)"),
          createBulletPoint("     - LEAVE (නිවාඩු ලබා ඇත / Unavailable due to leave)"),
          createBulletPoint("     - OFFLINE (රාජකාරි බැහැර / Safe out of service)"),
          createBulletPoint("ඔබ ක්ෂේත්‍ර රාජකාරියක් වෙනුවෙන් හෝ යම් අවශ්‍යතාවයකට පිටත්ව යන විට, පොදු ජනතාවගේ පහසුව සඳහා ඔබ නැවත කාර්යාලයට පැමිණෙන වේලාව (ETA) සටහන් කිරීමට අමතක නොකරන්න (උදාහරණ: '30' හෝ 'BACK IN 30 MIN')."),

          // FOOTER NOTE
          new Paragraph({
            spacing: { before: 480, after: 120 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "My Niyagama System Guidance Core Group - © 2026 All Rights Reserved",
                italics: true,
                size: 18,
                color: "64748b",
                font: "Segoe UI",
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const targetDir = path.resolve(process.cwd(), "public");
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.resolve(targetDir, "Officer_User_Guide.docx");
  fs.writeFileSync(targetPath, buffer);
  console.log(`Saved Officer Guide to ${targetPath}`);
}

async function buildExecutiveGuide() {
  console.log("Building Executive Officer User Guide...");

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // MAIN TITLE
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 360, after: 180 },
            children: [
              new TextRun({
                text: "මයි නියගම - විධායක සහ කළමනාකරණ පරිශීලක මාර්ගෝපදේශය",
                bold: true,
                size: 36,
                font: "Segoe UI Semibold",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 360 },
            children: [
              new TextRun({
                text: "විධායක නිලධාරීන් සඳහා වූ විශේෂ ආයතනික පාලන සහ අධීක්ෂණ අත්පොත (My Niyagama Executive Control Manual)",
                italics: true,
                size: 20,
                font: "Segoe UI",
              }),
            ],
          }),

          // DIVIDER LINE
          new Paragraph({
            spacing: { before: 120, after: 240 },
            children: [
              new TextRun({
                text: "_________________________________________________________________________________",
                color: "94a3b8",
                size: 16,
              }),
            ],
          }),

          // SECTION 1: PURPOSE & ROLE
          createHeaderParagraph("1. පද්ධතියේ ප්‍රධාන අරමුණ සහ විධායක කාර්යභාරය (Executive Purpose & Role)"),
          createBodyParagraph(
            "‘මයි නියගම (My Niyagama)’ පද්ධතිය තුළ ප්‍රාදේශීය ලේකම්වරයා, සහකාර ප්‍රාදේශීය ලේකම්වරයා, ගණකාධිකාරීවරයා සහ ප්‍රධාන ලිපිකරු ප්‍රමුඛ විධායක නිලධාරීන් හට ඉහළ ආයතනික කළමනාකරණ බලතල, අධීක්ෂණ පහසුකම් සහ තීරණ ගැනීමේ සුවිශේෂී මෙවලම් (Unified Institutional Oversight) සපයා ඇත.",
            false
          ),
          createBodyParagraph(
            "මෙමඟින් කාර්යාලයේ සමස්ත සේවක පිරිසේ සූදානම (Readiness Pulse), එදිනෙදා පැමිණීම්, නිවාඩු කළමනාකරණය, පොදු සම්පත් වෙන්කිරීම් සහ පොදු තොරතුරු පුවරුව (Public Display Dashboard) සජීවීව පාලනය කිරීමට විශේෂ උපකරණ පුවරුවක් විධායක කළමනාකාරිත්වය හට හිමිවේ.",
            false
          ),

          // SECTION 2: MONITORING CAPABILITIES
          createHeaderParagraph("2. විධායක නිලධාරීන් හට නිරීක්ෂණය සහ අධීක්ෂණය කළ හැකි ප්‍රධාන අංශ (Oversight & Monitoring)"),
          createBodyParagraph("විධායක නිලධාරීන්ට තම පාලක පැනලය (Institutional Control Panel) මඟින් පහත සඳහන් දත්තයන් සහ මොඩියුලයන් නිරන්තරයෙන් නිරීක්ෂණය කළ හැක:"),
          createBulletPoint("භෞතික සේවක සූදානම (Readiness Pulse): සියලුම සේවකයින්ගේ ජෛවමිතික පැමිණීම (Biometric Logs) සහ සැලසුම් කළ නිවාඩු පදනම් කරගෙන, ආයතනයේ රාජකාරි ධාරිතාවය සජීවීව ප්‍රතිශතයක් ලෙස ගණනය කර පෙන්වයි. සේවක සුදානම සියයට 85 ට වඩා අඩු වූ විට පද්ධතිය මඟින් එය රතු පැහැයෙන් අනතුරු අඟවනු ඇත."),
          createBulletPoint("සේවක ලේඛනය (Staff Registry 👥): කාර්යාලයේ සියලුම සේවකයින්ගේ ලියාපදිංචි දත්ත එකම තැනකින් බලාගැනීම."),
          createBulletPoint("ස්මාර්ට් බුද්ධිමය ඒකකය (Intel Suite ✨ / Deep Pulse): කෘතිම බුද්ධිය (AI Analytics) මඟින් සේවකයින්ගේ පැමිණීමේ ප්‍රවණතා, කාර්යක්ෂමතාවය සහ කාර්යාල ඵලදායිතාවය ස්වයංක්‍රීයව විශ්ලේෂණය කර වාර්තා ලබාදීම."),
          createBulletPoint("ජෛවමිතික විගණනය (Biometric Hub 🧬): සියලුම ඇඟිලි සලකුණු පැමිණීම් ලොග් වාර්තා පිරික්සීම."),

          // SECTION 3: SYSTEM WORKFLOW
          createHeaderParagraph("3. පද්ධති කාර්ය ප්‍රවාහය (System Workflow for Executive Management)"),
          createBodyParagraph("පරිපාලන කටයුතු සරල කිරීම සඳහා විධායක නිලධාරීන් දෛනිකව පහත සඳහන් කාර්ය ප්‍රවාහයන් පාලනය කළ යුතුය:"),
          createBulletPoint("නිවාඩු අනුමත කිරීම් (Leave Approvals): නිලධාරීන් පද්ධතිය මඟින් යොමු කරනු ලබන සියලුම නිවාඩු ඉල්ලීම් විධායක පැනලයට ලැබෙන අතර, ඒවා පරීක්ෂා කර එක් ක්ලික් කිරීමකින් අනුමත කිරීම (Approve) හෝ ප්‍රතික්ෂේප කිරීම (Deny) කළ හැක."),
          createBulletPoint("පැතිකඩ ඡායාරූප අනුමැතිය (Profile Picture Approval): ආයතනික නිල ඇඳුමට ගැලපෙන සහ රාජකාරිමය ස්වභාවය සුරැකෙන පරිදි නිලධාරීන් පළ කරන ඡායාරූප පරීක්ෂා කර අනුමත කිරීම."),
          createBulletPoint("නොපැමිණීම බලහත්කාරයෙන් සටහන් කිරීම (Mark Absence / Status Override): රාජකාරියක නිරතවන, නිවාඩු ලබා නොගෙන නොපැමිණි හෝ හදිසි බාහිර පුහුණුවක නිරතවන ඕනෑම නිලධාරියෙකුගේ පැමිණීමේ තත්ත්වය නිල වශයෙන් සටහන් කිරීමට විධායකයින්ට 'Mark Absence' බොත්තම මඟින් සෘජු අවසරය ලබා දී ඇත."),

          // SECTION 4: PUBLIC DISPLAY MANAGEMENT
          createHeaderParagraph("4. සජීවී පොදු තොරතුරු පුවරුව යාවත්කාලීන කිරීම (Public Dashboard Control & ETA Updates)"),
          createBodyParagraph(
            "කාර්යාලයට පැමිණෙන මහජනතාවට සහ බාහිර අමුත්තන්ට ආයතනයේ ප්‍රධාන ශාලාවේ ඇති රූපවාහිනී තිරවල ප්‍රදර්ශනය වන තොරතුරු සජීවීව පාලනය කිරීමේ විශේෂ පහසුකම (Public Display Control - 📺):",
            false
          ),
          createBulletPoint("නිවේදන කළමනාකරණය (Interactive Notices): නව මහජන හෝ ආයතනික නිවේදන, ප්‍රවෘත්ති පද්ධතියට එක් කිරීම සහ පුවරුවේ පෙන්වීම සක්‍රීය හෝ අක්‍රීය කිරීම."),
          createBulletPoint("විශේෂ උත්සව සහ පෝස්ටර් (Events Display): ඉදිරියට කොට්ඨාසය තුළ සංවිධානය කරනු ලබන උත්සවවල පෝස්ටර් රූපවාහිනී තිරවල සජීවීව ධාවනය කිරීම."),
          createBulletPoint("වීඩියෝ පෝලිම පාලනය (Video Playlist): ප්‍රදර්ශන තිරවල වාදනය වන යූටියුබ් (YouTube) රාජකාරිමය සහ දැනුවත් කිරීමේ වීඩියෝ මාරු කිරීම, ඉදිරියට හැරවීම (Skip Video) හෝ පෝලිම වෙනස් කිරීම."),
          createBulletPoint("හදිසි අනතුරු ඇඟවීම් (Emergency Alerts broadcasting): සජීවී හදිසි පණිවිඩ තිරයන් හරහා ප්‍රදර්ශනය කිරීම."),

          // SECTION 5: HOW TO UPDATE STATUS (IN, OUT, BACK TIME)
          createHeaderParagraph("5. නිලධාරීන්ගේ සජීවී තත්ත්වය යාවත්කාලීන කිරීමේ විශේෂ ක්‍රමවේදය (Status, IN, OUT & Back Time)"),
          createBodyParagraph(
            "පොදු මහජනතාවට විධායක නිලධාරීන් කාර්යාලය තුළ සිටීද, බැහැරව ගොස් ඇත්දැයි නිවැරදිව දැනගැනීමට සහ පද්ධතිය වඩාත් ඵලදායී කිරීමට පහත සඳහන් තත්ත්වයන් නිතිපතා යාවත්කාලීන කිරීම අනිවාර්ය වේ:",
            false
          ),
          createBulletPoint("Available (IN): ඔබ කාර්යාලයේ අසුනෙහි රාජකාරියේ යෙදී සිටින විට වත්මන් තත්ත්වය AVAILABLE ලෙස පවත්වා ගන්න."),
          createBulletPoint("Field / Meeting (OUT): ඔබ ක්ෂේත්‍ර රාජකාරියක (Field) හෝ රැස්වීමක (Meeting) සිටින විට තත්ත්වය ඒ අනුව තෝරාගන්න. මෙවිට මහජනතාවට ඔබ සේවා ස්ථානයේ නොමැති බව සජීවීව පෙන්වනු ලබයි."),
          createSubHeaderParagraph("ස්වයංක්‍රීය වේලාව හැඩසැන්වීමේ බුද්ධිමත් රීතිය (ETA Auto-Format Rule):"),
          createBodyParagraph(
            "පොදු පුවරුවේ ඔබ නැවත පැමිණෙන වේලාව (ETA - Estimated Time of Arrival) යෙදීමේදී ඔබට සිදුවන කාලය නාස්තිය අවම කිරීමට පද්ධතිය තුළ 'Auto-Format Magic' ඇල්ගොරිතමයක් සකසා ඇත. ඔබ නැවත පැමිණීමට බලාපොරොත්තු වන විනාඩි ගණන සරල ඉලක්කමකින් පමණක් ඇතුළත් කර සුරකියි නම් පද්ධතිය එය ස්වයංක්‍රීයව පහත පරිදි සකසනු ඇත:",
            false
          ),
          createRulePoint("ඔබ AVAILABLE තත්ත්වයේ සිටියදී '30' ලබා දුනහොත්: එය 'OFF IN 30 MIN' (විනාඩි 30 කින් නික්ම යනු ඇත) ලෙස ස්වයංක්‍රීයව පරිවර්තනය වේ."),
          createRulePoint("ඔබ FIELD (ක්ෂේත්‍ර) තත්ත්වයේ සිටියදී '45' ලබා දුනහොත්: එය 'FIELD FOR 45 MIN' (මීළඟ විනාඩි 45 පුරාම ක්ෂේත්‍ර රාජකාරියේ සිටී) ලෙස දර්ශනය වේ."),
          createRulePoint("ඔබ MEETING (රැස්වීම්) තත්ත්වයේ සිටියදී '120' ලබා දුනහොත්: එය 'BACK IN 2H' (නැවත පැමිණීම පැය 2 කින් සිදු වේ) ලෙස ලොබි තිරයන් මත සජීවීව පරිවර්තනය වේ."),
          createBodyParagraph(
            "එබැවින් ඔබ ක්ෂේත්‍ර රාජකාරියට යාමේදී හෝ රැස්වීමකට යාමේදී, සරලව විනාඩි ගණන පමණක් (උදා: 30, 45, 90, හෝ 120) සටහන් කිරීම ප්‍රමාණවත්ය.",
            false
          ),

          // FOOTER NOTE
          new Paragraph({
            spacing: { before: 480, after: 120 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "My Niyagama System Guidance Core Group - © 2026 All Rights Reserved",
                italics: true,
                size: 18,
                color: "64748b",
                font: "Segoe UI",
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const targetDir = path.resolve(process.cwd(), "public");
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.resolve(targetDir, "Executive_User_Guide.docx");
  fs.writeFileSync(targetPath, buffer);
  console.log(`Saved Executive Guide to ${targetPath}`);
}

async function run() {
  console.log("Generating Expanded Official Sinhala Word Document Guides...");
  await buildOfficerGuide();
  await buildExecutiveGuide();
  console.log("All Word documents generated successfully!");
}

run().catch((err) => {
  console.error("Failed to generate DOCX files:", err);
  process.exit(1);
});
