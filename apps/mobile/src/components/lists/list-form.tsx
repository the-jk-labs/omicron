import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ReadingList } from "@omicron/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type RefObject } from "react";
import { View } from "react-native";
import { useApi } from "@/components/instance-provider";
import { Button } from "@/components/ui/button";
import { Field, inputClass, SheetInput } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query/keys";

/** Create or edit a reading list: title, description and visibility (the web's ListFormDialog). */
export function ListFormSheet({
  sheetRef,
  list,
  onSaved,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  list?: ReadingList;
  onSaved?: (list: ReadingList) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(list?.title ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [isPrivate, setIsPrivate] = useState(list?.visibility === "private");

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: title.trim(),
        description: description.trim(),
        visibility: isPrivate ? ("private" as const) : ("public" as const),
      };
      return (list ? await api.updateList(list.id, body) : await api.createList(body)).list;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.list(saved.id) });
      sheetRef.current?.dismiss();
      if (!list) {
        setTitle("");
        setDescription("");
      }
      onSaved?.(saved);
    },
  });

  return (
    <Sheet sheetRef={sheetRef} title={list ? "Edit list" : "New list"}>
      <View className="gap-4 px-5">
        <Field label="Title">
          <SheetInput value={title} onChangeText={setTitle} placeholder="Weekend reads" className={inputClass} />
        </Field>
        <Field label="Description" hint="Optional.">
          <SheetInput
            value={description}
            onChangeText={setDescription}
            placeholder="What's this list about?"
            multiline
            className={`${inputClass} h-20 py-2`}
            textAlignVertical="top"
          />
        </Field>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text size="sm" weight="medium">
              Private
            </Text>
            <Text size="xs" tone="muted">
              Only you can see a private list.
            </Text>
          </View>
          <Switch checked={isPrivate} onCheckedChange={setIsPrivate} label="Private list" />
        </View>
        {save.error ? (
          <Text size="sm" tone="destructive">
            {errorMessage(save.error)}
          </Text>
        ) : null}
        <Button variant="solid" loading={save.isPending} disabled={!title.trim()} onPress={() => save.mutate()}>
          {list ? "Save" : "Create list"}
        </Button>
      </View>
    </Sheet>
  );
}
