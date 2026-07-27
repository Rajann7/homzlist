// Shared component library — Doc1 design system. Import from "@/components".
export { Button, type ButtonProps } from "./ui/Button";
export { Input, type InputProps } from "./ui/Input";
export { Chip, type ChipProps } from "./ui/Chip";
export { Toggle } from "./ui/Toggle";
export { BottomSheet } from "./ui/BottomSheet";
export { ConfirmDialog } from "./ui/Dialog";
export { ToastProvider, useToast } from "./ui/Toast";
export { Card } from "./ui/Card";
export { Avatar } from "./ui/Avatar";
export { StatusBadge, type BadgeKind } from "./ui/StatusBadge";
export { VerifiedBadge } from "./ui/VerifiedBadge";
export { Skeleton, CardSkeleton, ListRowSkeleton } from "./ui/Skeleton";
export { EmptyState } from "./ui/EmptyState";
export { ErrorState } from "./ui/ErrorState";
export { Spinner } from "./ui/Spinner";
export { Icon, type IconName } from "./ui/Icon";

// Billing / plans / boost (Module 3 — P11, P5 plan wall, P6 checkout)
export { Plans } from "./billing/Plans";
export { PlanWall } from "./billing/PlanWall";
export { MyPlan } from "./billing/MyPlan";
export { Payments, InvoiceSheet, DetailsSheet } from "./billing/Payments";
export { BoostBuy } from "./billing/BoostBuy";
export { BoostStatus } from "./billing/BoostStatus";
export { TopupSheet } from "./billing/TopupSheet";
export { Checkout } from "./billing/Checkout";
export { Success } from "./billing/Success";
export { payWithRazorpay, pollOrder } from "./billing/pay";

export { BottomNav, DEFAULT_NAV, type NavItem } from "./nav/BottomNav";
export { Header, Wordmark } from "./nav/Header";
export { AppShell } from "./nav/AppShell";

// Listings (Module 4 — P5 creation, P6 preview/drafts, P4 detail)
export { PostType, PropertyTypePicker } from "./listings/PostType";
export { CreateEntry } from "./listings/CreateEntry";
export { ListingForm } from "./listings/ListingForm";
export { Photos } from "./listings/Photos";
export { Preview } from "./listings/Preview";
export { MyListings } from "./listings/MyListings";
export { Trash } from "./listings/Trash";
export { Drafts } from "./listings/Drafts";
export { ListingDetail } from "./listings/ListingDetail";

// Chat, inquiry & number system (Module 7 — P7)
export { Messages } from "./chat/Messages";
export { Requests } from "./chat/Requests";
export { Thread } from "./chat/Thread";
export { Details as ChatDetails } from "./chat/Details";
export { Archived as ArchivedChats } from "./chat/Archived";
export { Blocked as BlockedUsers } from "./chat/Blocked";

// Notifications (Module 10 — P11 S7 + P10 S7 prefs)
export { Notifications } from "./notifications/Notifications";
export { NotificationPrefs } from "./notifications/NotificationPrefs";

// Settings suite (P10 — S6 home + leaf screens)
export { SettingsHome } from "./settings/SettingsHome";
export { LoginActivity } from "./settings/LoginActivity";
export { Language } from "./settings/Language";
export { Privacy } from "./settings/Privacy";
export { AccountStatusScreen } from "./settings/AccountStatusScreen";

// Saved (P10 S1 — wishlist + private collections)
export { Saved } from "./saved/Saved";

// Your activity (P10 S2 + S2b saved searches)
export { Activity } from "./activity/Activity";
export { SavedSearches } from "./activity/SavedSearches";

// Archived (P10 S5 — sold/rented listings)
export { Archived } from "./archived/Archived";
