import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    void request;
    return NextResponse.json(
        {
            error: 'Self-service account creation is disabled. Accounts are provisioned via secure email links only.',
        },
        { status: 403 }
    );
}
