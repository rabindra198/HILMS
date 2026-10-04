import { useEffect, useState } from "react";
import { Camera, UserRound, X } from "lucide-react";
import { PHOTO_ACCEPT_ATTRIBUTE } from "@/services/profileApi";

const initialsOf = (name) =>
  String(name || "A")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "A";

export default function ProfileAvatar({
  name,
  photoUrl,
  size = "md",
  className = "",
  onUpload,
  onRemove,
  uploading = false,
  editable = false,
}) {
  // A stored reference can still point at a file that is gone - a restored
  // database, a cleared volume, a photo deleted outside the app. Falling back to
  // initials keeps the page honest instead of rendering a broken image icon.
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    setUnavailable(false);
  }, [photoUrl]);

  const showPhoto = Boolean(photoUrl) && !unavailable;

  const sizeClasses =
    size === "lg"
      ? "size-24 text-2xl"
      : size === "sm"
        ? "size-10 text-sm"
        : "size-16 text-lg";

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <div
        className={`group relative shrink-0 overflow-hidden rounded-full border border-deept/10 bg-white shadow-sm ${sizeClasses}`}
      >
        {showPhoto ? (
          <img
            src={photoUrl}
            alt={`${name || "User"} avatar`}
            className="h-full w-full object-cover"
            onError={() => setUnavailable(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-teal-pale font-heading font-semibold text-teal-deep">
            {initialsOf(name) || <UserRound className="size-5" />}
          </div>
        )}
        {editable && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/60 opacity-0 transition-opacity group-hover:opacity-100">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-white/90 p-2 text-teal-deep shadow-sm transition hover:bg-white">
              <Camera className="size-4" />
              <input
                type="file"
                accept={PHOTO_ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && onUpload) {
                    onUpload(file);
                  }
                  // Reset so choosing the same file twice still fires onChange.
                  event.target.value = "";
                }}
                disabled={uploading}
              />
            </label>
            {showPhoto && onRemove && (
              <button
                type="button"
                onClick={() => {
                  const confirmed =
                    typeof window === "undefined" ||
                    window.confirm(
                      "Remove your profile photo? Your initials will be shown instead."
                    );
                  if (confirmed) onRemove();
                }}
                disabled={uploading}
                title="Remove photo"
                aria-label="Remove profile photo"
                className="inline-flex items-center justify-center rounded-full bg-coral/90 p-2 text-white shadow-sm transition hover:bg-coral disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {uploading && (
        <span className="mt-2 text-xs font-medium text-teal-mid">
          Uploading...
        </span>
      )}
    </div>
  );
}