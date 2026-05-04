"use client";

import { useState } from "react";

export default function CustomerForm({ customerDetails, onSubmit }) {
  const [form, setForm] = useState({
    name: customerDetails?.name || "",
    email: customerDetails?.email || "",
    phone: customerDetails?.phone || "",
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validate = (field, value) => {
    if (field === "name") {
      if (!value.trim()) return "Full name is required";
      if (value.trim().length < 2) return "Name must be at least 2 characters";
    } else if (field === "email") {
      if (!value.trim()) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email";
    } else if (field === "phone") {
      if (!value.trim()) return "Mobile number is required";
      if (!/^(\+44|0)7\d{9}$/.test(value.replace(/\s/g, ""))) return "Enter a valid UK mobile";
    }
    return null;
  };

  const handleChange = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (touched[field]) setErrors((p) => ({ ...p, [field]: validate(field, value) }));
  };

  const handleBlur = (field) => {
    setTouched((p) => ({ ...p, [field]: true }));
    setErrors((p) => ({ ...p, [field]: validate(field, form[field]) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = { name: validate("name", form.name), email: validate("email", form.email), phone: validate("phone", form.phone) };
    setErrors(newErrors);
    setTouched({ name: true, email: true, phone: true });
    if (Object.values(newErrors).some((e) => e !== null)) return;
    onSubmit(form);
  };

  const ic = (field) =>
    `w-full px-4 py-3.5 rounded-xl text-white text-sm bg-[var(--card-bg)] border transition-all duration-300 outline-none placeholder:text-[var(--text-muted)]/60 ${
      errors[field] && touched[field]
        ? "border-red-500/60 focus:border-red-400"
        : "border-[var(--glass-border)] focus:border-[var(--gold)]/60 focus:shadow-[0_0_15px_rgba(201,168,76,0.1)]"
    }`;

  return (
    <div className="animate-fade-in-up">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>Your Details</h2>
      <p className="text-sm text-[var(--text-muted)] text-center mb-6">We&apos;ll use this to confirm your booking</p>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 pl-1">Full Name</label>
          <input type="text" id="customer-name" placeholder="e.g. John Smith" value={form.name} onChange={(e) => handleChange("name", e.target.value)} onBlur={() => handleBlur("name")} className={ic("name")} autoComplete="name" />
          {errors.name && touched.name && <p className="text-red-400 text-xs mt-1.5 pl-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 pl-1">Email Address</label>
          <input type="email" id="customer-email" placeholder="e.g. john@example.com" value={form.email} onChange={(e) => handleChange("email", e.target.value)} onBlur={() => handleBlur("email")} className={ic("email")} autoComplete="email" />
          {errors.email && touched.email && <p className="text-red-400 text-xs mt-1.5 pl-1">{errors.email}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 pl-1">UK Mobile Number</label>
          <input type="tel" id="customer-phone" placeholder="e.g. 07700 900123" value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} onBlur={() => handleBlur("phone")} className={ic("phone")} autoComplete="tel" />
          {errors.phone && touched.phone && <p className="text-red-400 text-xs mt-1.5 pl-1">{errors.phone}</p>}
        </div>
        <button type="submit" className="btn-gold w-full text-sm mt-2" id="submit-details">Continue to Payment</button>
      </form>
    </div>
  );
}
