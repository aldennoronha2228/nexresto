export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/auth/profile
 * Fetches the current user's profile using service role (bypasses RLS).
 * This avoids the infinite-recursion RLS policy on user_profiles.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
        return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Verify the user's token
    const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Use service role to fetch profile (bypasses RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
    });

    // FIRST check if they are explicitly a super_admin in admin_users
    // (This overrides their restaurant role so they can manage the platform)
    const { data: superAdminData } = await serviceClient
        .from('admin_users')
        .select('email, full_name, is_active, role')
        .eq('email', user.email)
        .eq('is_active', true)
        .eq('role', 'super_admin')
        .maybeSingle();

    if (superAdminData) {
        return NextResponse.json({
            profile: {
                tenant_id: null,
                tenant_name: null,
                role: 'super_admin',
                full_name: superAdminData.full_name || user.email,
                subscription_tier: null,
                subscription_status: null,
            },
        });
    }

    // THEN check user_profiles for regular users (owners, staff)
    // This provides their restaurant role
    const { data, error } = await serviceClient
        .from('user_profiles')
        .select('tenant_id, role, full_name, restaurants(name, subscription_tier, subscription_status)')
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If user has a profile, use that role (owner, staff, etc.)
    if (data) {
        return NextResponse.json({
            profile: {
                tenant_id: data.tenant_id,
                tenant_name: (data as any).restaurants?.name ?? data.tenant_id,
                role: data.role,
                full_name: data.full_name,
                subscription_tier: (data as any).restaurants?.subscription_tier ?? 'starter',
                subscription_status: (data as any).restaurants?.subscription_status ?? 'active',
            },
        });
    }

    // No profile found anywhere
    return NextResponse.json({ profile: null });
}
