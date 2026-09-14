// POST /api/grievances/submit
// Public, unauthenticated endpoint. Citizens submit a new grievance here.
// No login required. Basic spam protection via honeypot + minimum fill-time.

function generateTrackingRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 ambiguity
  let ref = "GRV-";
  for (let i = 0; i < 6; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

function isPlausiblePhone(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    category_id,
    local_unit_id,
    description,
    citizen_phone,
    photo_url, // optional — set by a prior call to /api/grievances/upload-photo
    // Spam-protection fields, not stored:
    website,      // honeypot — real users never see/fill this
    form_loaded_at, // ms timestamp from when the form rendered
  } = body;

  // --- Silent bot handling: pretend success, insert nothing ---
  const tookTooLittleTime =
    typeof form_loaded_at === "number" &&
    Date.now() - form_loaded_at < 3000; // under 3 seconds is not human

  if (website || tookTooLittleTime) {
    return new Response(
      JSON.stringify({ success: true, tracking_ref: generateTrackingRef() }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Real validation ---
  const errors = [];
  if (!category_id) errors.push("Category is required.");
  if (!local_unit_id) errors.push("Location is required.");
  if (!description || description.trim().length < 15) {
    errors.push("Description must be at least 15 characters.");
  }
  if (!isPlausiblePhone(citizen_phone)) {
    errors.push("A valid phone number is required.");
  }

  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: errors.join(" ") }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Confirm category and local unit actually exist (FK safety)
    const category = await env.DB.prepare(
      `SELECT id FROM grievance_categories WHERE id = ?`
    )
      .bind(category_id)
      .first();

    const localUnit = await env.DB.prepare(
      `SELECT id FROM local_units WHERE id = ?`
    )
      .bind(local_unit_id)
      .first();

    if (!category) {
      return new Response(JSON.stringify({ error: "Unknown category." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!localUnit) {
      return new Response(JSON.stringify({ error: "Unknown location." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate a unique tracking ref (retry on the rare collision)
    let trackingRef;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateTrackingRef();
      const existing = await env.DB.prepare(
        `SELECT id FROM grievances WHERE tracking_ref = ?`
      )
        .bind(candidate)
        .first();
      if (!existing) {
        trackingRef = candidate;
        break;
      }
    }
    if (!trackingRef) {
      return new Response(
        JSON.stringify({ error: "Could not generate a tracking reference. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const id = crypto.randomUUID();
    const normalizedPhone = citizen_phone.replace(/\D/g, "");

    await env.DB.prepare(
      `INSERT INTO grievances
        (id, tracking_ref, citizen_phone, description, category_id, local_unit_id, status, current_tier, photo_url)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'LOCAL', ?)`
    )
      .bind(id, trackingRef, normalizedPhone, description.trim(), category_id, local_unit_id, photo_url || null)
      .run();

    return new Response(
      JSON.stringify({ success: true, tracking_ref: trackingRef }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Submission failed. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
