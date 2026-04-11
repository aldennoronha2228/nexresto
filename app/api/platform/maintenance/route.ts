import { NextResponse } from 'next/server';
import { getPlatformMaintenanceMode } from '@/lib/platform-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    const enabled = await getPlatformMaintenanceMode();
    return NextResponse.json(
        { enabled },
        {
            headers: {
                'Cache-Control': 'no-store',
            },
        }
    );
}
