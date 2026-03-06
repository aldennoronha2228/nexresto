import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: "Missing env vars" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: users, error: profileError } = await supabase.from('user_profiles').select('*');
    const { data: adminUsers, error: adminError } = await supabase.from('admin_users').select('*');
    const { data: restaurants, error: restaurantError } = await supabase.from('restaurants').select('*');
    const { data: rolePerms, error: rpError } = await supabase.from('role_permissions').select('*');

    return NextResponse.json({
        users,
        adminUsers,
        restaurants,
        rolePerms,
        profileError,
        adminError,
        restaurantError,
        rpError
    });
}
