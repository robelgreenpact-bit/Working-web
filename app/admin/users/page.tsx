"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  department_id: string | null;
  manager_id: string | null;
  departments: { name: string } | null;
};

type Department = {
  id: string;
  name: string;
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "worker",
    department_id: "",
    manager_id: "",
  });

  const loadData = async () => {
    setLoading(true);
    const [usersRes, deptRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/departments"),
    ]);
    const usersData = await usersRes.json();
    const deptData = await deptRes.json();
    setUsers(usersData.users || []);
    setDepartments(deptData.departments || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Failed to create user");
      return;
    }

    setSuccess(`User ${form.email} created successfully`);
    setForm({
      name: "",
      email: "",
      password: "",
      role: "worker",
      department_id: "",
      manager_id: "",
    });
    loadData();
  };

  const handleResetPassword = async (userId: string, email: string) => {
    const newPassword = prompt(
      `Enter a new temporary password for ${email} (min 8 characters):`,
    );

    if (!newPassword) return;

    if (newPassword.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }

    const res = await fetch("/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, new_password: newPassword }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to reset password");
      return;
    }

    alert(
      `Password reset for ${email}. They'll be asked to set a new password on next login.`,
    );
  };

  const managers = users.filter((u) => u.role === "manager");

  return (
    <div>
      <Navbar title="Admin Dashboard" />
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-deep">
          Admin Dashboard
        </h1>

        {/* Add User Form */}
        <div className="mb-10 rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-brand-deep">
            Add New User
          </h2>

          {error && (
            <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}
          {success && (
            <p className="mb-4 rounded bg-green-50 p-2 text-sm text-green-600">
              {success}
            </p>
          )}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Full Name
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Company Email
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@greenpactconsulting.com"
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Temporary Password
              </label>
              <input
                type="text"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              >
                <option value="worker">Worker</option>
                <option value="manager">Manager</option>
                <option value="finance">Finance &amp; Administration</option>
                <option value="accountant">Accountant</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Department
              </label>
              <select
                value={form.department_id}
                onChange={(e) =>
                  setForm({ ...form, department_id: e.target.value })
                }
                className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
              >
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {form.role === "worker" && (
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Assigned Manager
                </label>
                <select
                  value={form.manager_id}
                  onChange={(e) =>
                    setForm({ ...form, manager_id: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 p-2 text-gray-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
                >
                  <option value="">— None —</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-brand-deep px-4 py-2 font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>
        </div>

        {/* User List */}
        <div className="rounded-lg border-t-4 border-brand bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-brand-deep">
            All Users
          </h2>

          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Department</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2">{u.name}</td>
                    <td className="py-2">{u.email}</td>
                    <td className="py-2">
                      {u.role === "finance"
                        ? "Finance & Administration"
                        : u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </td>
                    <td className="py-2">{u.departments?.name || "—"}</td>
                    <td className="py-2 capitalize">{u.status}</td>
                    <td className="py-2">
                      <button
                        onClick={() => handleResetPassword(u.id, u.email)}
                        className="rounded bg-amber-100 px-3 py-1 text-xs text-amber-800 hover:bg-amber-200"
                      >
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
