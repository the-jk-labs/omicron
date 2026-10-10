package org.omicron.mobile.feature.common

import kotlinx.io.IOException
import org.omicron.mobile.data.repository.MissingInstanceException

enum class MobileFeatureError {
    Offline,
    Server,
    MissingInstance,
}

internal fun Throwable.toMobileFeatureError(): MobileFeatureError =
    when (this) {
        is MissingInstanceException -> MobileFeatureError.MissingInstance
        is IOException -> MobileFeatureError.Offline
        else -> MobileFeatureError.Server
    }
