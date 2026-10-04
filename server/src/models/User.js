const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { ROLES, ROLE_VALUES } = require("../config/roles");

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const USER_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter your name"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please enter your email"],
      unique: true,
      lowercase: true,
      trim: true,
      // TLD 2-63 characters, the real DNS limit. A 2-3 character cap would reject
      // legitimate domains such as .local, .health and .care.
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,63})+$/, "Please enter a valid email"],
    },
    phone: {
      type: String,
      trim: true,
    },
    // Canonical contact field for the registration forms. `phone` is kept in
    // sync (see the hook below) so existing records and existing admin screens
    // keep working while new writes use the clearer name.
    contactNumber: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      maxlength: [300, "Address must be at most 300 characters"],
    },
    profilePhotoUrl: {
      type: String,
      trim: true,
    },
    // Doctor-only identity. Left unset for every other role.
    nmcNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    // Laboratory-only identity. Left unset for every other role.
    labRegistryNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },

    // ---- Clinical demographics -------------------------------------------
    // Additive fields for the doctor clinical workspace (FR-DR-02) and the
    // printable prescription header (FR-DR-04). Every one is optional, so
    // existing accounts keep working untouched until someone fills them in.
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""],
      default: "",
    },
    // Free-text allergy list. Stored as written so a clinician can record
    // "Penicillin - rash" rather than being forced into a coded vocabulary the
    // SRS does not define.
    allergies: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    emergencyContactName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    emergencyContactNumber: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    // Doctor-only professional detail shown on prescriptions and the workspace
    // header. Distinct from `nmcNumber`, which is the legal registration.
    department: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    qualification: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    specialization: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    // Doctor-only fee charged for a consultation, in the same unit as
    // `LabTest.price`. Stored here rather than in the frontend because billing
    // must be computed from real server-side prices: an invoice line is generated
    // from this value and the amount actually charged is recorded on the invoice.
    consultationFee: {
      type: Number,
      min: 0,
      default: null,
    },

    password: {
      type: String,
      required: [true, "Please enter your password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: ROLE_VALUES,
      default: ROLES.PATIENT,
    },
    // Account lifecycle state. Authoritative source of truth for "may this
    // account authenticate?". PENDING/REJECTED accounts are refused by the
    // backend auth middleware, never by the frontend alone.
    status: {
      type: String,
      enum: USER_STATUSES,
      default: "APPROVED",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // FR-AUTH-10 / NFR-04: consecutive failed sign-ins are counted here and the
    // account is temporarily locked once the configurable threshold is reached.
    // A successful sign-in (or an expired lock followed by one) resets both
    // fields, so a legitimate user is never permanently locked out by a
    // forgotten password; they either wait out the window or reset the password.
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    // FR-AUTH-11: bumped on logout / "sign out everywhere" so every previously
    // issued token - which carries the version it was minted with - stops being
    // accepted immediately, even though a JWT is otherwise stateless.
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Set when an Admin approves a Doctor / Laboratory request. The account is
    // usable immediately, but it is confined to the change-password screen
    // until the temporary password is replaced (enforced server-side by the
    // `blockUntilPasswordChanged` middleware, not by the frontend alone).
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    temporaryPasswordIssuedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// A registration/licence number identifies exactly one professional, so it must
// never be shared between two accounts. `sparse` keeps the many doctors and
// laboratories without a number from colliding on an empty value.
userSchema.index(
  { nmcNumber: 1 },
  { unique: true, sparse: true, name: "one_account_per_nmc_number" }
);
userSchema.index(
  { labRegistryNumber: 1 },
  { unique: true, sparse: true, name: "one_account_per_lab_registry" }
);

// Keep `phone` and `contactNumber` mirroring each other so there is only ever
// one logical value regardless of which field a caller populated.
userSchema.pre("validate", function (next) {
  if (!this.contactNumber && this.phone) this.contactNumber = this.phone;
  if (!this.phone && this.contactNumber) this.phone = this.contactNumber;
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  // Allow an already-hashed password to be adopted verbatim (used when an
  // approved access request activates the account) without double hashing.
  if (BCRYPT_HASH_PATTERN.test(this.password)) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Keep the legacy boolean flag in lockstep with the authoritative status.
userSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.isActive = this.status === "APPROVED";
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

module.exports = mongoose.model("User", userSchema);
module.exports.USER_STATUSES = USER_STATUSES;



