import { createMMKV } from "react-native-mmkv";

// App-wide preferences and the persisted query cache. Credentials live in SecureStore instead.
export const storage = createMMKV({ id: "omicron" });
