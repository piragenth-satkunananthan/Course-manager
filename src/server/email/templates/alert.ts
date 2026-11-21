import { esc, layout } from "./layout";

/** A direct alert: names the cause and what to do (design §10, file 36). */
export function alertEmail(title: string, whatToDo: string, appOrigin: string) {
  const subject = `Course-manager needs you: ${title}`;
  return {
    subject,
    html: layout(subject, `<p style="margin:0 0 16px">${esc(whatToDo)}</p><p style="margin:0"><a href="${esc(appOrigin)}/" style="color:#0f766e;font-weight:600">Open Course-manager</a></p>`),
    text: `${subject}\n\n${whatToDo}\n\nOpen ${appOrigin}/`,
  };
}
