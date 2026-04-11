import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

initializeApp();

const db = getFirestore();

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getTodayYmdIst(): string {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istNow.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const resetDailyAiCount = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
  },
  async () => {
    const snap = await db.collection('restaurants').get();
    if (snap.empty) {
      logger.info('No restaurant documents found for daily AI reset');
      return;
    }

    const bulkWriter = db.bulkWriter();
    const todayYmd = getTodayYmdIst();

    snap.docs.forEach((restaurantDoc) => {
      bulkWriter.set(
        restaurantDoc.ref,
        {
          usage: {
            dailyAiCount: 0,
            dailyAiDate: todayYmd,
            dailyAiResetAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
    });

    await bulkWriter.close();
    logger.info(`Daily AI usage reset complete for ${snap.size} restaurants`);
  },
);
