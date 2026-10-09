package org.omicron.mobile.data.cache

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostDetail

class FileOfflinePostCacheTest {
    @Test
    fun evictsLeastRecentlyReadArticleAtEntryLimit() = runBlocking {
        var now = 1_000L
        withCache(now = { now }, maxEntries = 2, maxAgeMillis = Long.MAX_VALUE) { cache ->
            cache.write(ORIGIN, post("post-1"))
            now = 2_000L
            cache.write(ORIGIN, post("post-2"))
            now = 3_000L
            assertNotNull(cache.read(ORIGIN, "post-1"))
            now = 4_000L
            cache.write(ORIGIN, post("post-3"))

            assertNotNull(cache.read(ORIGIN, "post-1"))
            assertNull(cache.read(ORIGIN, "post-2"))
            assertNotNull(cache.read(ORIGIN, "post-3"))
        }
    }

    @Test
    fun expiresArticlesAndKeepsOriginsSeparate() = runBlocking {
        var now = 1_000L
        withCache(now = { now }, maxAgeMillis = 100L) { cache ->
            cache.write(ORIGIN, post("post-1", "Instance A"))
            now = 1_001L
            cache.write(OTHER_ORIGIN, post("post-1", "Instance B"))

            assertEquals("Instance A", cache.read(ORIGIN, "post-1")?.post?.title)
            assertEquals("Instance B", cache.read(OTHER_ORIGIN, "post-1")?.post?.title)

            now = 1_101L
            assertNull(cache.read(ORIGIN, "post-1"))
            assertEquals("Instance B", cache.read(OTHER_ORIGIN, "post-1")?.post?.title)
        }
    }

    @Test
    fun refusesToPersistDrafts() = runBlocking {
        withCache { cache ->
            cache.write(ORIGIN, post("draft-1").copy(status = OwnPostStatus.Draft))

            assertNull(cache.read(ORIGIN, "draft-1"))
            assertTrue(cache.entries(ORIGIN).isEmpty())
        }
    }

    @Test
    fun skipsARecordLargerThanTheCacheByteLimit() = runBlocking {
        withCache(maxBytes = 1L) { cache ->
            cache.write(ORIGIN, post("post-1"))

            assertTrue(cache.entries(ORIGIN).isEmpty())
        }
    }

    @Test
    fun clearingAnInstanceKeepsOtherInstancesCached() = runBlocking {
        withCache { cache ->
            cache.write(ORIGIN, post("post-1", "First instance"))
            cache.write(OTHER_ORIGIN, post("post-1", "Second instance"))
            cache.clear(ORIGIN)

            assertNull(cache.read(ORIGIN, "post-1"))
            assertEquals("Second instance", cache.read(OTHER_ORIGIN, "post-1")?.post?.title)
        }
    }

    private suspend fun withCache(
        now: () -> Long = { 10_000L },
        maxEntries: Int = 50,
        maxBytes: Long = Long.MAX_VALUE,
        maxAgeMillis: Long = 30L * 24 * 60 * 60 * 1000,
        block: suspend (FileOfflinePostCache) -> Unit,
    ) {
        val directory =
            InstrumentationRegistry.getInstrumentation().targetContext.cacheDir.resolve(
                "offline-post-cache-test-${System.nanoTime()}",
            )
        try {
            block(
                FileOfflinePostCache(
                    directory = directory,
                    now = now,
                    maxEntries = maxEntries,
                    maxBytes = maxBytes,
                    maxAgeMillis = maxAgeMillis,
                ),
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun post(id: String, title: String = "Article $id") =
        PostDetail(
            id = id,
            title = title,
            contentHtml = "<p>$title</p>",
            coverUrl = null,
            coverCredit = null,
            language = "en",
            summary = null,
            status = OwnPostStatus.Published,
            createdAt = "2026-01-01T00:00:00Z",
            author = PostAuthor("user-1", "alice", "Alice", null, remote = false),
            tags = emptyList(),
            likeCount = 0,
            commentCount = 0,
            recommendCount = 0,
            remote = false,
        )

    private companion object {
        const val ORIGIN = "https://first.example"
        const val OTHER_ORIGIN = "https://second.example"
    }
}
