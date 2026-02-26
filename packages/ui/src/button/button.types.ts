/** Shared Button prop interface — implemented by both .web.tsx and .native.tsx. */
export interface ButtonProps {
  /** Button label text. */
  label: string;
  /** Called when the button is pressed/clicked. */
  onPress: () => void;
  /** Disables interaction and applies disabled styling. */
  disabled?: boolean;
  /** Visual variant. */
  variant?: 'primary' | 'secondary' | 'destructive';
  /** Whether to show a loading spinner and disable interaction. */
  loading?: boolean;
}
