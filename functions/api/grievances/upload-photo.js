// POST /api/grievances/upload-photo
// Public, unauthenticated endpoint. Accepts a single image file and stores
// it in the grieviq-photos R2 bucket. Returns the public URL to attach to
// a grievance submission. Called by the intake form before the main
// /api/grievances/submit call.

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// This must match the Public Development URL shown in the R2 bucket settings.
const PUBLIC_BUCKET_URL = "https://pub-ac9455a7b50a4db788dcf813a10aac9a.r2.dev";

export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const file = formData.get("photo");

    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ error: "No photo was provided." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: "Only JPG, PNG, WEBP, or HEIC photos are allowed." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_BYTES) {
      return new Response(
        JSON.stringify({ error: "Photo must be smaller than 5MB." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const extension = file.type.split("/")[1] || "jpg";
    const key = `grievance-photos/${crypto.randomUUID()}.${extension}`;

    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const photoUrl = `${PUBLIC_BUCKET_URL}/${key}`;

    return new Response(JSON.stringify({ success: true, photo_url: photoUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Photo upload failed. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
