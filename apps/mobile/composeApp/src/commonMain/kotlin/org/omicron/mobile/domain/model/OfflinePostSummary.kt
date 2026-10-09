package org.omicron.mobile.domain.model

data class OfflinePostSummary(
    val id: String,
    val title: String?,
    val authorDisplayName: String,
    val summary: String?,
    val cachedAtMillis: Long,
)
