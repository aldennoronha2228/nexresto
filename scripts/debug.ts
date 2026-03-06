import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== USER PROFILES ===");
    let { data: up } = await supabase.from('user_profiles').select('*');
    console.dir(up, { depth: null });

    console.log("\n=== RESTAURANTS ===");
    let { data: rests } = await supabase.from('restaurants').select('*');
    console.dir(rests, { depth: null });

    console.log("\n=== ADMIN USERS ===");
    let { data: admins } = await supabase.from('admin_users').select('*');
    console.dir(admins, { depth: null });
}

main().catch(console.error);
