package org.omicron.mobile.core.storage

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.omicron.mobile.domain.model.AppearancePreference

class SharedPreferencesAppearancePreferenceStore(context: Context) : AppearancePreferenceStore {
    private val preferences = context.getSharedPreferences("appearance", Context.MODE_PRIVATE)

    override suspend fun read(): AppearancePreference =
        withContext(Dispatchers.IO) {
            when (preferences.getString(PREFERENCE, null)) {
                "light" -> AppearancePreference.Light
                "dark" -> AppearancePreference.Dark
                else -> AppearancePreference.System
            }
        }

    override suspend fun write(preference: AppearancePreference) {
        withContext(Dispatchers.IO) {
            preferences.edit().putString(PREFERENCE, preference.name.lowercase()).apply()
        }
    }

    private companion object {
        const val PREFERENCE = "preference"
    }
}
