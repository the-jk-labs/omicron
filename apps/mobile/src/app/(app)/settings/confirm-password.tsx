import { useQueryClient } from "@tanstack/react-query";
import { ConfirmPasswordForm } from "@/components/settings/confirm-password-form";
import { FormScreen } from "@/components/settings/form-screen";
import { Text } from "@/components/ui/text";
import { goBack } from "@/lib/navigation";
import { queryKeys } from "@/lib/query/keys";

export default function ConfirmPassword() {
  const queryClient = useQueryClient();
  return (
    <FormScreen title="Confirm it's you">
      <Text tone="muted">For your security, enter your password to see where you&apos;re signed in.</Text>
      <ConfirmPasswordForm
        onConfirmed={async () => {
          // The list is ready on the way back, so the locked row doesn't flash.
          await queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
          goBack();
        }}
      />
    </FormScreen>
  );
}
