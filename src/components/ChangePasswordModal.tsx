import React, { useState } from 'react';
import { Check, KeyRound, Lock } from 'lucide-react';
import { Modal } from './Modal';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/localAuth';
import { ApiError, messageFor } from '../services/api';

export interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Lets a signed-in user change their own password.
 *
 * The current password must be supplied, so holding the session cookie is not
 * enough — that stops a borrowed or unattended browser from locking the real
 * owner out. Hashing, length rules and session re-issuance are all server-side.
 */
export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { passwordMinLength } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const inputCls =
    'w-full pl-9 pr-3 py-2.5 text-sm border border-neutral-300 rounded-lg focus:border-emerald-500 focus:outline-none text-neutral-800 bg-white placeholder:text-neutral-400';
  const iconCls = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none';

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setReveal(false);
    setError('');
    setBusy(false);
    setDone(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < passwordMinLength) {
      setError(`Your new password must be at least ${passwordMinLength} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choose a password different from your current one.');
      return;
    }

    setBusy(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setDone(true);
      // Drop the plaintext from component state now it is no longer needed.
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('That is not your current password.');
      } else {
        setError(messageFor(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Change password" maxWidth="max-w-md">
      {done ? (
        <div className="text-center py-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-neutral-800">Password updated</h3>
          <p className="text-sm text-neutral-500 mt-1">
            Use your new password the next time you sign in. You are still signed in here.
          </p>
          <button
            onClick={close}
            className="mt-5 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-neutral-500">
            Choose a new password for your account. You will stay signed in on this device.
          </p>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          <div className="relative">
            <Lock className={iconCls} />
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className={inputCls}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="relative">
            <KeyRound className={iconCls} />
            <input
              type={reveal ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className={inputCls}
              autoComplete="new-password"
              minLength={passwordMinLength}
              required
            />
          </div>

          <div className="relative">
            <KeyRound className={iconCls} />
            <input
              type={reveal ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className={inputCls}
              autoComplete="new-password"
              required
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-neutral-500 select-none">
            <input
              type="checkbox"
              checked={reveal}
              onChange={(e) => setReveal(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
            />
            Show new password
          </label>

          <p className="text-[11px] text-neutral-400">
            At least {passwordMinLength} characters. Choose something you do not reuse elsewhere.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className="flex-1 py-2.5 border border-neutral-200 text-neutral-600 rounded-lg font-semibold text-sm hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg font-semibold text-sm"
            >
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ChangePasswordModal;