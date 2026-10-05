export const NOTIFICATIONS_CHANGED_EVENT = "hilms:notifications-changed";

export const notifyNotificationsChanged = () => {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
};
