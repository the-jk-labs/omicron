package org.omicron.mobile.data.cache

import org.omicron.mobile.domain.model.PostDetail

data class CachedPostDetail(
    val post: PostDetail,
    val cachedAtMillis: Long,
)

interface OfflinePostCache {
    suspend fun read(origin: String, postId: String): CachedPostDetail?

    suspend fun entries(origin: String): List<CachedPostDetail>

    suspend fun write(origin: String, post: PostDetail)

    suspend fun remove(origin: String, postId: String)

    suspend fun clear(origin: String)
}
