// functions/_shared/contact-validation.js
//
// ONE set of rules for a representative's contact details (name, phone,
// email), used wherever they are saved: the admin Jurisdiction page's
// direct edits now, and data-entry operators' change requests (both when
// a request is made and again when it is approved).
//
// Rules (OWASP input validation: check format, length and type on the
// server, never trust the page):
//   - name:  up to 120 characters
//   - phone: 10 to 13 digits once spaces, dashes, brackets and a leading +
//            are ignored (Indian mobiles and landlines with STD code)
//   - email: name@example.com form, up to 200 characters
// A field left empty means "no value on file" and is stored as null.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, maxLen) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v === "" ? null : v.slice(0, maxLen);
}

// input: { name, phone, email } -- any field may be missing (= not being set)
// returns { ok: true, values } with only the fields that were given, or
//         { ok: false, field, error }
export function validateContact(input) {
  const values = {};
  if (input.name !== undefined) {
    const name = clean(input.name, 200);
    if (name && name.length > 120) {
      return { ok: false, field: "name", error: "Keep the name to 120 characters or fewer." };
    }
    values.name = name;
  }
  if (input.phone !== undefined) {
    const phone = clean(input.phone, 60);
    if (phone) {
      if (!/^[+\d\s\-()]+$/.test(phone)) {
        return { ok: false, field: "phone", error: "Enter the phone number using digits only, for example 9876543210 or 0522 2234567." };
      }
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) {
        return { ok: false, field: "phone", error: "Enter a phone number with 10 to 13 digits, for example 9876543210 or 0522 2234567." };
      }
      if (phone.length > 40) {
        return { ok: false, field: "phone", error: "Enter a phone number with 10 to 13 digits, for example 9876543210 or 0522 2234567." };
      }
    }
    values.phone = phone;
  }
  if (input.email !== undefined) {
    const email = clean(input.email, 400);
    if (email) {
      if (email.length > 200 || !EMAIL_RE.test(email)) {
        return { ok: false, field: "email", error: "Enter the email address in the format name@example.com." };
      }
    }
    values.email = email;
  }
  return { ok: true, values };
}
