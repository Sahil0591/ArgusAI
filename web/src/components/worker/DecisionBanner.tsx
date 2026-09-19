export function DecisionBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
      {message}
    </div>
  );
}
