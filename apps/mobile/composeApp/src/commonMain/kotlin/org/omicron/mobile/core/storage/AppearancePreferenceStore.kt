package org.omicron.mobile.core.storage

import org.omicron.mobile.domain.model.AppearancePreference

interface AppearancePreferenceStore {
    suspend fun read(): AppearancePreference

    suspend fun write(preference: AppearancePreference)
}
