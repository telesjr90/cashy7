import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  extractReceiptFromBytes,
  type ReceiptExtractionResult,
} from "./receipt-extraction.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ReceiptUploadRow = {
  id: string;
  uploaded_by: string;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  status: string;
};

function jsonResponse(body: ReceiptExtractionResult | { error: string }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function unauthorizedResult(): ReceiptExtractionResult {
  return {
    status: "unauthorized",
    merchant: null,
    date: null,
    total: null,
    tax: null,
    category: null,
    lineItems: [],
    confidence: null,
    fieldConfidence: {},
    warnings: ["You must be signed in to extract receipts."],
    rawProviderName: null,
    providerConfigured: false,
  };
}

function notFoundResult(): ReceiptExtractionResult {
  return {
    status: "not_found",
    merchant: null,
    date: null,
    total: null,
    tax: null,
    category: null,
    lineItems: [],
    confidence: null,
    fieldConfidence: {},
    warnings: ["Receipt upload was not found."],
    rawProviderName: null,
    providerConfigured: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        status: "provider_error",
        merchant: null,
        date: null,
        total: null,
        tax: null,
        category: null,
        lineItems: [],
        confidence: null,
        fieldConfidence: {},
        warnings: ["Only POST requests are supported."],
        rawProviderName: null,
        providerConfigured: false,
      },
      405
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(unauthorizedResult(), 401);
  }

  let receiptId = "";
  try {
    const body = await req.json();
    receiptId =
      typeof body?.receiptId === "string" ? body.receiptId.trim() : "";
  } catch {
    return jsonResponse(
      {
        status: "provider_error",
        merchant: null,
        date: null,
        total: null,
        tax: null,
        category: null,
        lineItems: [],
        confidence: null,
        fieldConfidence: {},
        warnings: ["Receipt id is required."],
        rawProviderName: null,
        providerConfigured: false,
      },
      400
    );
  }

  if (!receiptId) {
    return jsonResponse(
      {
        status: "provider_error",
        merchant: null,
        date: null,
        total: null,
        tax: null,
        category: null,
        lineItems: [],
        confidence: null,
        fieldConfidence: {},
        warnings: ["Receipt id is required."],
        rawProviderName: null,
        providerConfigured: false,
      },
      400
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(
      {
        status: "provider_error",
        merchant: null,
        date: null,
        total: null,
        tax: null,
        category: null,
        lineItems: [],
        confidence: null,
        fieldConfidence: {},
        warnings: ["Server configuration is incomplete."],
        rawProviderName: null,
        providerConfigured: false,
      },
      500
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonResponse(unauthorizedResult(), 401);
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("receipt_uploads")
    .select(
      "id, uploaded_by, storage_bucket, storage_path, original_file_name, mime_type, status"
    )
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError) {
    return jsonResponse(
      {
        status: "provider_error",
        merchant: null,
        date: null,
        total: null,
        tax: null,
        category: null,
        lineItems: [],
        confidence: null,
        fieldConfidence: {},
        warnings: ["Could not load receipt upload."],
        rawProviderName: null,
        providerConfigured: false,
      },
      500
    );
  }

  if (!receipt) {
    return jsonResponse(notFoundResult(), 404);
  }

  const row = receipt as ReceiptUploadRow;
  if (row.uploaded_by !== user.id) {
    return jsonResponse(unauthorizedResult(), 403);
  }

  if (row.status !== "uploaded") {
    return jsonResponse(
      {
        status: "unsupported",
        merchant: null,
        date: null,
        total: null,
        tax: null,
        category: null,
        lineItems: [],
        confidence: null,
        fieldConfidence: {},
        warnings: ["This receipt is not available for extraction."],
        rawProviderName: null,
        providerConfigured: false,
      },
      409
    );
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(row.storage_bucket)
    .download(row.storage_path);

  if (downloadError || !fileBlob) {
    return jsonResponse(
      {
        status: "not_found",
        merchant: null,
        date: null,
        total: null,
        tax: null,
        category: null,
        lineItems: [],
        confidence: null,
        fieldConfidence: {},
        warnings: ["Receipt file could not be loaded."],
        rawProviderName: null,
        providerConfigured: false,
      },
      404
    );
  }

  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  const result = await extractReceiptFromBytes({
    bytes,
    mimeType: row.mime_type,
    fileName: row.original_file_name,
  });

  return jsonResponse(result);
});
