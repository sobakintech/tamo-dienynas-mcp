import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkRange, dateOnly, localTime, mondayOf, monthRange, today } from "../src/dates.js";
import { mapDiary, mapFeed, mapPeriods, mapSemester, mapWeek, mapWork } from "../src/mappers.js";
import { isPlaceholder, plain } from "../src/text.js";

const week = {
  formatives: [
    {
      key: "p;7",
      items: [
        { lessonId: 2, subject: "Gamtos mokslai", date: "2026-09-23", type: "Savarankiškas darbas", title: "6" },
        { lessonId: 1, subject: "Gamtos mokslai", date: "2026-09-16", type: "Apklausa", title: "8", isConverted: true },
      ],
    },
  ],
  days: [
    {
      date: "2026-09-23",
      events: [
        {
          id: 2,
          eventIcon: { content: "2" },
          eventTitle: { content: "Gamtos mokslai" },
          references: { formatives: "p;7" },
          rightIconsMiddle: { contentType: "icon", content: "icon_note_negative" },
          timeFromUtc: "2026-09-23T05:10:00Z",
          timeToUtc: "2026-09-23T05:55:00Z",
        },
      ],
    },
    {
      date: "2026-09-24",
      events: [
        {
          id: 3,
          eventIcon: { content: "2" },
          eventTitle: { content: "Gamtos mokslai" },
          eventSubtitle: { content: "Mokytoja" },
          references: { formatives: "p;7" },
          rightIconsTop: { contentType: "text", content: "5" },
          eventDetails: [
            { key: "grade", icon: { content: "5" }, title: { content: "Praktinis darbas" }, body: { content: "Penki" } },
            { key: "homework", title: { content: "Namų darbas" }, body: { content: "-" } },
          ],
        },
      ],
    },
    {
      date: "2026-09-25",
      events: [
        {
          id: 4,
          eventTitle: { content: "Gamtos mokslai" },
          eventLabel: { content: "Atsiskaitymas", styleRef: "event_label_important" },
          bottomIconsRight: [
            { key: "trend", contentType: "icon", content: "icon_arrow_right" },
            { key: "average", contentType: "text", content: "5" },
          ],
        },
      ],
    },
  ],
};

test("week keeps lesson details, joins formatives by lesson and drops placeholder homework", () => {
  const [first, second, third] = mapWeek(week).map((day) => day.lessons[0]!);
  assert.deepEqual(first!.formatives, [{ value: "6", type: "Savarankiškas darbas" }]);
  assert.equal(first!.note, "negative");
  assert.equal(first!.start, "08:10");
  assert.equal(first!.end, "08:55");
  assert.equal(first!.number, 2);
  assert.deepEqual(second!.marks, ["5"]);
  assert.equal(second!.teacher, "Mokytoja");
  assert.deepEqual(second!.details, [{ kind: "grade", title: "Praktinis darbas", text: "Penki" }]);
  assert.equal(second!.formatives, undefined);
  assert.equal(third!.label, "Atsiskaitymas");
  assert.equal(third!.important, true);
  assert.equal(third!.subjectAverage, "5");
});

test("malformed collections are errors, not empty days", () => {
  assert.throws(() => mapWeek({ days: null }));
  assert.throws(() => mapWork({}));
  assert.deepEqual(mapWork({ items: [] }), []);
});

test("diary splits grades, attendance and formatives", () => {
  const diary = mapDiary({
    items: [
      { subject: "Dailė", subjectDate: "2026-09-08", assessmentValue: "10", assessmentType: "Klasės darbas", attendanceValue: "p" },
      { subject: "Matematika", subjectDate: "2026-09-18", assessmentValue: "", attendanceValue: "nl" },
    ],
    formativeGrades: [
      { lessonId: 5, subject: "Gamtos mokslai", date: "2026-09-09", type: "Apklausa", title: "+", system: "PLIUSAI_MINUSAI", isConverted: false, percents: 80 },
    ],
  });
  assert.deepEqual(diary.grades, [{ date: "2026-09-08", subject: "Dailė", value: "10", type: "Klasės darbas" }]);
  assert.deepEqual(diary.attendance.map((entry) => entry.value), ["p", "nl"]);
  assert.deepEqual(diary.formatives, [
    { date: "2026-09-09", subject: "Gamtos mokslai", value: "+", type: "Apklausa", system: "PLIUSAI_MINUSAI", percents: 80, convertedToGrade: false },
  ]);
});

test("homework keeps attachments even with placeholder text and reads completion", () => {
  const work = mapWork({
    items: [
      { lessonId: 1, date: "2026-09-07", deadline: "2026-09-09", homeWork: "-", thingName: "Dailė", files: [{ fileId: "f-1", fileName: "uzduotis.pdf" }] },
      { lessonId: 2, date: "2026-09-07", deadline: "2026-09-09", homeWork: "Skaityti", thingName: "Istorija", completionDate: "2026-09-08T10:00:00" },
      { lessonId: 3, date: "2026-09-07", deadline: "2026-09-09", homeWork: "x", thingName: "Dailė" },
    ],
  });
  assert.deepEqual(work, [
    { subject: "Dailė", assigned: "2026-09-07", due: "2026-09-09", done: false, files: ["uzduotis.pdf"] },
    { subject: "Istorija", text: "Skaityti", assigned: "2026-09-07", due: "2026-09-09", done: true, completedOn: "2026-09-08" },
  ]);
});

test("feed items are classified", () => {
  const feed = mapFeed([
    { id: 1, eventId: 4, date: "2026-09-25T13:15:24", eventDetails: { HomeWork: "Vad. 12 psl.", ThingName: "Geografija", Date: "2026-09-25 00:00", Deadline: "2026-10-01" } },
    { id: 2, eventId: 1, date: "2026-09-24T12:37:12", eventDetails: { ThingName: "Gamtos mokslai", Date: "2026-09-24 00:00", Type: "1", Value: "5" } },
    { id: 3, eventId: 8, date: "2026-09-24T12:19:50", eventDetails: { Type: "Pastaba", Value: "Neatlikti namų darbai", ThingName: "Lietuvių kalba" } },
    { id: 4, eventId: 10, date: "2026-09-24T07:38:10", eventDetails: { ThingName: "Anglų", Date: "2026-09-22 00:00", Vertinimas: "9", Tipas: "Savarankiškas darbas" } },
    { id: 5, eventId: 8, date: "2026-09-23T12:56:28", eventDetails: { Type: "Pagyrimas", Value: "Gerai dirbo.", ThingName: "Gyvenimo įgūdžiai" } },
    { id: 6, eventId: 2, date: "2026-09-22T12:55:32", eventDetails: { ThingName: "Verslo simuliacijos", Type: "1" } },
  ]);
  assert.deepEqual(feed.map((item) => item.kind), ["homework", "grade", "remark", "formative", "praise", "attendance"]);
  assert.equal(feed[0]!.due, "2026-10-01");
  assert.equal(feed[1]!.lessonDate, "2026-09-24");
  assert.equal((feed[5] as Record<string, unknown>).value, "absent");
});

test("periods and semester parse legacy shapes", () => {
  const periods = mapPeriods({
    groups: [{ id: "periods", filteritems: [{ name: "1 pusmetis", values: ["123", "456"], selected: true }, { name: "Metinis", values: ["123", "0"] }] }],
  });
  assert.deepEqual(periods, [
    { title: "1 pusmetis", personId: "123", periodId: "456", selected: true },
    { title: "Metinis", personId: "123", periodId: "0", selected: false },
  ]);
  const [subject] = mapSemester([{ subject: "Matematika", average: "8,75", main: "9", textMarks: [{ value: "įsk." }] }]);
  assert.deepEqual(subject, { subject: "Matematika", average: 8.75, finalGrade: "9", textMarks: ["įsk."] });
  assert.equal(mapSemester([{ average: "11" }])[0]!.average, undefined);
});

test("dates use Vilnius time and split long ranges", () => {
  assert.equal(today(new Date("2026-10-04T22:30:00Z")), "2026-10-05");
  assert.equal(mondayOf("2026-10-04"), "2026-09-28");
  assert.equal(mondayOf("2026-09-28"), "2026-09-28");
  assert.deepEqual(monthRange("2026-02"), ["2026-02-01", "2026-02-28"]);
  assert.deepEqual(chunkRange("2026-09-01", "2026-12-31"), [
    ["2026-09-01", "2026-11-02"],
    ["2026-11-03", "2026-12-31"],
  ]);
  assert.equal(dateOnly("2026.09.25"), "2026-09-25");
  assert.equal(dateOnly("nope"), "");
  assert.equal(localTime("2026-01-15T07:00:00Z"), "09:00");
});

test("text helpers strip HTML and detect placeholders", () => {
  assert.equal(plain("Skaityti<br>12&nbsp;psl. &amp; 13"), "Skaityti\n12 psl. & 13");
  assert.equal(isPlaceholder(" – "), true);
  assert.equal(isPlaceholder("..."), true);
  assert.equal(isPlaceholder("7 pratimas"), false);
});
