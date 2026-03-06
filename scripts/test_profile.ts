import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== PROFILE TEST ===");
    let { data, error } = await supabase
        .from('user_profiles')
        .select('tenant_id, role, full_name, restaurants(name, subscription_tier, subscription_status)')
        .eq('id', '609044dc-d9dc-43a1-8eda-8251fda84af7')
        .maybeSingle();
    console.dir({ data, error }, { depth: null });
}

main().catch(console.error);
