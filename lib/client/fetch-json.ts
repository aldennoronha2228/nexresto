type FetchJsonOptions = RequestInit & {
    label?: string;
};

function summarizeHeaders(headers: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === 'authorization') {
            out[key] = value ? `${value.slice(0, 12)}…` : '';
            return;
        }
        if (lower === 'cookie') {
            out[key] = value ? '[redacted]' : '';
            return;
        }
        out[key] = value;
    });
    return out;
}

export async function fetchJsonWithDiagnostics<T = unknown>(input: RequestInfo | URL, options: FetchJsonOptions = {}): Promise<T> {
    const { label = 'fetch-json', headers: headersInit, ...init } = options;
    const headers = new Headers(headersInit);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init.method || 'GET').toUpperCase();

    console.log(`[${label}] REQUEST`, {
        url,
        method,
        headers: summarizeHeaders(headers),
        credentials: init.credentials || 'same-origin',
    });

    try {
        const response = await fetch(input, {
            ...init,
            headers,
            credentials: init.credentials ?? 'include',
        });

        console.log(`[${label}] STATUS:`, response.status);
        console.log(`[${label}] HEADERS:`, Object.fromEntries(response.headers.entries()));
        console.log(`[${label}] CONTENT TYPE:`, response.headers.get('content-type'));

        const rawText = await response.text();
        console.log(`[${label}] RAW TEXT:`, rawText);

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        try {
            return JSON.parse(rawText) as T;
        } catch (error) {
            console.error(`[${label}] INVALID JSON RESPONSE`, error);
            throw new Error(`Server returned invalid JSON. Status: ${response.status}`);
        }
    } catch (error) {
        console.error(`[${label}] NETWORK OR PARSE FAILURE`, error);
        throw error;
    }
}