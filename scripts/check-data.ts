import { db } from "../src/lib/db"
async function main() {
  const [users, clubs, hours, tasks, meetings, announcements, messages] = await Promise.all([
    db.user.count(), db.club.count(), db.serviceHour.count(), db.task.count(),
    db.meeting.count(), db.announcement.count(), db.message.count(),
  ])
  console.log(JSON.stringify({ users, clubs, hours, tasks, meetings, announcements, messages }))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
