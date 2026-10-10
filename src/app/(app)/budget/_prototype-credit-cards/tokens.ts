// PROTOTYPE (#145): colour classes for light + dark. The app has no dark mode
// yet, so dark values are Atlassian's dark-theme tokens applied via the
// `dark` class the prototype toggles on its own wrapper.

export const t = {
  surface: "bg-neutral-0 dark:bg-[#22272B]",
  surfaceAlt: "bg-neutral-100 dark:bg-[#1D2125]",
  hover: "hover:bg-neutral-100 dark:hover:bg-[#2C333A]",
  border: "border-neutral-200 dark:border-[#38414A]",
  rowBorder: "border-neutral-100 dark:border-[#2C333A]",
  text: "text-neutral-800 dark:text-[#DEE4EA]",
  muted: "text-neutral-600 dark:text-[#9FADBC]",
  faint: "text-neutral-400 dark:text-[#738496]",
  brand: "text-brand-700 dark:text-[#579DFF]",
  brandBtn:
    "bg-brand-700 text-neutral-0 hover:bg-brand-800 dark:bg-[#579DFF] dark:text-[#1D2125] dark:hover:bg-[#85B8FF]",
  ghostBtn:
    "border border-neutral-200 text-neutral-800 hover:bg-neutral-100 dark:border-[#38414A] dark:text-[#DEE4EA] dark:hover:bg-[#2C333A]",
  ok: "text-success dark:text-[#4BCE97]",
  okBg: "bg-success dark:bg-[#4BCE97]",
  // Cash overspending: red, like today's overspending.
  cash: "text-danger dark:text-[#F87168]",
  cashBg: "bg-danger dark:bg-[#F87168]",
  cashTint: "bg-danger/10 dark:bg-[#F87168]/15",
  // Credit overspending, amber option (#B38600 is below 4.5:1 on white for
  // small text, so text uses a darker amber).
  credit: "text-[#8F6A00] dark:text-[#F5CD47]",
  creditBg: "bg-warning dark:bg-[#F5CD47]",
  creditTint: "bg-warning/15 dark:bg-[#F5CD47]/15",
  // Credit overspending, purple option (variant C).
  creditAlt: "text-discovery dark:text-[#9F8FEF]",
  creditAltBg: "bg-discovery dark:bg-[#9F8FEF]",
  creditAltTint: "bg-discovery/10 dark:bg-[#9F8FEF]/15",
  input:
    "rounded border border-neutral-200 bg-neutral-0 px-2 py-1 text-body text-neutral-800 focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-[#38414A] dark:bg-[#1D2125] dark:text-[#DEE4EA]",
};
