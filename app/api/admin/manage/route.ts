import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY ?? '';

// Team limits per tier
const TEAM_LIMITS = {
    starter: 2,
    '1k': 2,
    pro: 10,
    '2k': 10,
    '2.5k': 10,
};

// Role badge colors for UI reference
export const ROLE_COLORS = {
    owner: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Owner' },
    manager: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Manager' },
    staff: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Staff' },
};

/**
 * /api/admin/manage
 * 
 * Handles management of admin users.
 * Uses the privileged supabaseAdmin client to bypass Row Level Security (RLS).
 * Requires the ADMIN_ACCESS_KEY in the headers for all operations.
 */

// ─── Verification Gate ───────────────────────────────────────────────────────
function verifyKey(req: NextRequest) {
    const key = (req.headers.get('x-admin-key') || '').trim();
    const secret = (process.env.ADMIN_ACCESS_KEY || '').trim();

    // ERROR: If the server itself doesn't have the key set, that's a config issue.
    if (!secret) return { isValid: false, reason: 'SERVER_CONFIG_MISSING' };

    const isValid = key === secret;
    return { isValid, reason: isValid ? null : 'KEY_MISMATCH' };
}

export async function GET(req: NextRequest) {
    console.log('[admin-manage] GET request received');

    try {
        const { isValid, reason } = verifyKey(req);
        if (!isValid) {
            if (reason === 'SERVER_CONFIG_MISSING') {
                return NextResponse.json({
                    error: 'Server Misconfigured: Missing ADMIN_ACCESS_KEY',
                    detail: 'Please add ADMIN_ACCESS_KEY to your hosting environment variables.'
                }, { status: 500 });
            }
            return NextResponse.json({ error: 'Auth Error: Invalid Master Key (Manage)' }, { status: 401 });
        }

        const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!roleKey) {
            console.error('[admin-manage] SUPABASE_SERVICE_ROLE_KEY is missing from .env!');
            return NextResponse.json({
                error: 'Server Misconfigured: Missing Service Role Key',
                detail: 'Please add SUPABASE_SERVICE_ROLE_KEY to your .env file to enable this feature.'
            }, { status: 500 });
        }

        console.log('[admin-manage] Fetching admin list from Supabase (ADMIN)...');
        const { data, error } = await supabaseAdmin
            .from('admin_users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[admin-manage] Supabase error:', error.message);
            throw error;
        }

        console.log('[admin-manage] Success. Found', data?.length, 'admins');
        return NextResponse.json(data);
    } catch (err: any) {
        console.error('[admin-manage] GET CRASH:', err.message);
        return NextResponse.json({
            error: 'Server Error',
            detail: err.message,
        }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const { isValid, reason } = verifyKey(req);
    if (!isValid) {
        if (reason === 'SERVER_CONFIG_MISSING') {
            return NextResponse.json({ error: 'Server Config Error: Secret Missing' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Auth Error: Invalid Master Key (Action)' }, { status: 401 });
    }

    try {
        const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!roleKey) {
            console.error('[admin-manage] SUPABASE_SERVICE_ROLE_KEY is missing from .env!');
            return NextResponse.json({
                error: 'Server Misconfigured: Missing Service Role Key',
                detail: 'Please add SUPABASE_SERVICE_ROLE_KEY to your .env file to enable this feature.'
            }, { status: 500 });
        }

        const { email, action, role, tenantId, subscriptionTier } = await req.json();

        if (action === 'add' || action === 'invite') {
            // Server-side limit enforcement
            if (tenantId && subscriptionTier) {
                const limit = TEAM_LIMITS[subscriptionTier as keyof typeof TEAM_LIMITS] || 2;

                // Count current team members for this tenant
                const { data: currentMembers, error: countError } = await supabaseAdmin
                    .from('user_profiles')
                    .select('id')
                    .eq('tenant_id', tenantId)
                    .in('role', ['owner', 'manager', 'staff', 'admin']);

                if (countError) throw countError;

                const currentCount = currentMembers?.length || 0;

                if (currentCount >= limit) {
                    const tierName = subscriptionTier === 'pro' || subscriptionTier === '2k' ? 'Pro' : 'Starter';
                    return NextResponse.json({
                        error: `${tierName} tier allows maximum ${limit} team members. ${tierName === 'Starter' ? 'Upgrade to Pro for up to 10 staff accounts.' : 'Contact support if you need more.'}`
                    }, { status: 403 });
                }
            }

            // Determine final role (Starter tier only gets owner)
            const isStarterTier = ['starter', '1k'].includes(subscriptionTier || '');
            const finalRole = isStarterTier ? 'owner' : (role || 'staff');

            // Check if user already exists in auth
            const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
            const existingUser = existingUsers?.users?.find(u => u.email === email);

            if (existingUser) {
                // User already exists - check if they're in user_profiles for this tenant
                const { data: existingProfile } = await supabaseAdmin
                    .from('user_profiles')
                    .select('id')
                    .eq('id', existingUser.id)
                    .eq('tenant_id', tenantId)
                    .single();

                if (existingProfile) {
                    return NextResponse.json({
                        error: 'This user is already a member of your restaurant.'
                    }, { status: 400 });
                }

                // Add existing user to this tenant's user_profiles
                const { error: profileError } = await supabaseAdmin
                    .from('user_profiles')
                    .upsert({
                        id: existingUser.id,
                        tenant_id: tenantId,
                        role: finalRole,
                        full_name: existingUser.user_metadata?.full_name || email.split('@')[0],
                    });

                if (profileError) throw profileError;
            } else {
                // New user - create account directly with temporary password
                // (Supabase invite requires SMTP configuration which may not be set up)

                // Generate a secure temporary password
                const tempPassword = `Welcome${Math.random().toString(36).slice(-6).toUpperCase()}!${Math.floor(Math.random() * 90 + 10)}`;

                const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: email,
                    password: tempPassword,
                    email_confirm: true, // Auto-confirm so they can login immediately
                    user_metadata: {
                        restaurant_id: tenantId,
                        role: finalRole,
                        full_name: email.split('@')[0],
                        invited_at: new Date().toISOString(),
                        needs_password_change: true,
                    },
                });

                if (createError) {
                    console.error('[admin-manage] Create user error:', createError.message);
                    throw createError;
                }

                // Create user_profile for the new user
                if (createData?.user) {
                    const { error: profileError } = await supabaseAdmin
                        .from('user_profiles')
                        .upsert({
                            id: createData.user.id,
                            tenant_id: tenantId,
                            role: finalRole,
                            full_name: email.split('@')[0],
                        });

                    if (profileError) {
                        console.error('[admin-manage] Profile creation error:', profileError.message);
                    }
                }

                // Also add to admin_users for backward compatibility
                const { error } = await supabaseAdmin
                    .from('admin_users')
                    .upsert({
                        email,
                        is_active: true,
                        role: finalRole,
                        full_name: email.split('@')[0],
                    });
                if (error && !error.message.includes('role')) {
                    console.error('[admin-manage] admin_users upsert error:', error.message);
                }

                return NextResponse.json({
                    message: 'Team member created successfully!',
                    tempPassword: tempPassword,
                    instructions: `Share this temporary password with ${email}. They should change it after first login.`
                });
            }

            // For existing users, also add to admin_users
            const { error } = await supabaseAdmin
                .from('admin_users')
                .upsert({
                    email,
                    is_active: true,
                    role: finalRole,
                    full_name: email.split('@')[0],
                });
            if (error && !error.message.includes('role')) {
                console.error('[admin-manage] admin_users upsert error:', error.message);
            }

            return NextResponse.json({
                message: 'Team member added successfully! They can now login with their existing credentials.'
            });
        } else if (action === 'remove') {
            const { error } = await supabaseAdmin
                .from('admin_users')
                .update({ is_active: false })
                .eq('email', email);
            if (error) throw error;
            return NextResponse.json({ message: 'Admin deactivated' });
        } else if (action === 'reactivate') {
            const { error } = await supabaseAdmin
                .from('admin_users')
                .update({ is_active: true })
                .eq('email', email);
            if (error) throw error;
            return NextResponse.json({ message: 'Admin reactivated' });
        } else if (action === 'delete') {
            // Fully delete user from auth and profiles to free up the seat
            const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
            const existingUser = usersData?.users?.find(u => u.email === email);

            if (existingUser) {
                // Delete from user_profiles
                await supabaseAdmin.from('user_profiles').delete().eq('id', existingUser.id);
                // Also delete from auth to fully remove the user and prevent future login/add conflicts
                await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
            }

            const { error } = await supabaseAdmin
                .from('admin_users')
                .delete()
                .eq('email', email);
            if (error) throw error;
            return NextResponse.json({ message: 'Admin deleted' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * Explanation for Beginners:
 * 
 * "State Management" is how we keep track of what is happening in the app.
 * In this file, we use "Server-Side Verification" – the server checks the
 * x-admin-key header against a secret key stored on the server (.env).
 * If they don't match, we stop the request before touching the database.
 */
