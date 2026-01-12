import express from "express";
import cors from "cors";
import Stripe from "stripe";

const app = express();
app.use(express.json());

// Lock CORS to your real domains later (recommended)
app.use(cors({
  origin: true,
  methods: ["POST", "GET"],
  allowedHeaders: ["Content-Type"]
}));

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY; // sk_test_... / sk_live_...
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY env var.");
}
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }); // safe modern baseline

// Fee schedule (server source of truth — must match your business rules)
const FEE_SCHEDULE = {
  "United States": {
    currency: "usd",
    regions: {
      "Alabama": 150, "Alaska": 200, "Arizona": 175, "Arkansas": 150, "California": 200,
      "Colorado": 175, "Connecticut": 175, "Delaware": 175, "Florida": 175, "Georgia": 175,
      "Hawaii": 200, "Idaho": 150, "Illinois": 175, "Indiana": 150, "Iowa": 150,
      "Kansas": 150, "Kentucky": 150, "Louisiana": 175, "Maine": 150, "Maryland": 175,
      "Massachusetts": 200, "Michigan": 175, "Minnesota": 175, "Mississippi": 150, "Missouri": 150,
      "Montana": 150, "Nebraska": 150, "Nevada": 175, "New Hampshire": 150, "New Jersey": 200,
      "New Mexico": 150, "New York": 200, "North Carolina": 175, "North Dakota": 150, "Ohio": 175,
      "Oklahoma": 150, "Oregon": 175, "Pennsylvania": 175, "Rhode Island": 175, "South Carolina": 175,
      "South Dakota": 150, "Tennessee": 150, "Texas": 175, "Utah": 150, "Vermont": 150,
      "Virginia": 175, "Washington": 175, "West Virginia": 150, "Wisconsin": 150, "Wyoming": 150
    }
  },
  "Canada": {
    currency: "cad",
    regions: {
      "Alberta": 200, "British Columbia": 200, "Manitoba": 175, "New Brunswick": 175,
      "Newfoundland and Labrador": 175, "Nova Scotia": 175, "Ontario": 200, "Prince Edward Island": 175,
      "Quebec": 200, "Saskatchewan": 175, "Northwest Territories": 200, "Nunavut": 200, "Yukon": 200
    }
  },
  "Other / International": {
    currency: "usd",
    regions: { "Standard International": 200 }
  }
};

function getFee(country, region) {
  const c = FEE_SCHEDULE[country];
  if (!c) return null;
  const amount = c.regions[region];
  if (!amount) return null;
  // Guardrails: keep within expected bounds
  if (amount < 150 || amount > 200) return null;
  return { amount, currency: c.currency };
}

// Optional: simple origin allowlist (recommended once you know your domains)
app.use((req, res, next) => {
  if (!ALLOWED_ORIGINS.length) return next();
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) return next();
  return res.status(403).json({ error: "Origin not allowed." });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { country, region, orgName, contactName, email, phone } = req.body || {};
    const fee = getFee(country, region);
    if (!fee) {
      return res.status(400).json({ error: "Invalid jurisdiction selection." });
    }

    // Stripe uses the smallest currency unit (cents for USD/CAD)
    const unitAmount = Math.round(fee.amount * 100);

    const intent = await stripe.paymentIntents.create({
      amount: unitAmount,
      currency: fee.currency,
      automatic_payment_methods: { enabled: true },

      description: "HPG onboarding administrative fee",
      metadata: {
        country: String(country || ""),
        region: String(region || ""),
        orgName: String(orgName || "").slice(0, 200),
        contactName: String(contactName || "").slice(0, 200),
        email: String(email || "").slice(0, 200),
        phone: String(phone || "").slice(0, 50)
      },

      receipt_email: typeof email === "string" ? email : undefined
    });

    return res.json({
      clientSecret: intent.client_secret,
      amount: fee.amount,
      currency: fee.currency
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error creating payment intent." });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`HPG fee server running on port ${port}`));
