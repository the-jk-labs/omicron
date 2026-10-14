package org.omicron.mobile.data.repository

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.omicron.mobile.core.storage.FakeHomeSnapshotStore
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.HomeSnapshot
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostAuthor
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HomeSnapshotRepositoryTest {
    @Test
    fun restoresOnlyTheSelectedOriginWithAnUnexpiredCookie() = runTest {
        val store = FakeHomeSnapshotStore(snapshot())
        val repository = HomeSnapshotRepository(store, now = { now })

        assertEquals("cached", repository.preload(origin, true)?.posts?.single()?.id)
        assertNull(repository.preload("https://other.example", true)?.user)
        assertTrue(repository.snapshot.value!!.posts.isEmpty())
        assertNull(store.snapshot)
    }

    @Test
    fun accountSnapshotsWithoutACookieAreDiscardedButGuestSnapshotsRemainReadable() = runTest {
        val store = FakeHomeSnapshotStore(snapshot())
        val repository = HomeSnapshotRepository(store, now = { now })

        assertNull(repository.preload(origin, false)?.user)
        assertTrue(repository.snapshot.value!!.posts.isEmpty())
        store.snapshot = snapshot().copy(user = null, scope = "Global")
        assertEquals("cached", repository.preload(origin, false)?.posts?.single()?.id)
    }

    @Test
    fun feedExpiryDoesNotDiscardTheStillValidAccount() = runTest {
        val store = FakeHomeSnapshotStore(snapshot().copy(postsUpdatedAtMillis = now - HomeSnapshotRepository.POSTS_MAX_AGE_MILLIS - 1))
        val repository = HomeSnapshotRepository(store, now = { now })

        val loaded = repository.preload(origin, true)!!

        assertEquals(user, loaded.user)
        assertTrue(loaded.posts.isEmpty())
        assertNull(loaded.postsUpdatedAtMillis)
        assertTrue(store.snapshot!!.posts.isEmpty())
    }

    @Test
    fun expiredUnknownAndFutureDatedAccountRecordsAreDiscarded() = runTest {
        for (record in listOf(
            snapshot().copy(accountUpdatedAtMillis = now - HomeSnapshotRepository.ACCOUNT_MAX_AGE_MILLIS - 1),
            snapshot().copy(accountUpdatedAtMillis = now + 1),
            snapshot().copy(version = 2),
        )) {
            val store = FakeHomeSnapshotStore(record)
            val repository = HomeSnapshotRepository(store, now = { now })
            assertNull(repository.preload(origin, true)?.user)
            assertNull(store.snapshot)
        }
    }

    @Test
    fun refreshingTheSameAccountRetainsPostsButSwitchingAccountsClearsThem() = runTest {
        val store = FakeHomeSnapshotStore(snapshot())
        val repository = HomeSnapshotRepository(store, now = { now })
        repository.preload(origin, true)

        repository.rememberAccount(origin, user.copy(displayName = "Updated reader"))
        assertEquals("cached", store.snapshot!!.posts.single().id)
        repository.rememberAccount(origin, user.copy(id = "other", username = "other"))

        assertTrue(store.snapshot!!.posts.isEmpty())
        assertNull(store.snapshot!!.postsUpdatedAtMillis)
    }

    @Test
    fun boundsPostsAndSerializedBytesWithoutPersistingCursorsOrTokens() = runTest {
        val store = FakeHomeSnapshotStore()
        val repository = HomeSnapshotRepository(store, now = { now })
        repository.preload(origin, false)
        val lease = repository.lease(origin)

        repository.savePage(lease, TimelineScope.Global, (1..50).map { post("post-$it").copy(title = "x".repeat(100_000), contentHtml = "<p>Preview body</p>") })

        val record = store.snapshot!!
        val encoded = Json.encodeToString(record)
        assertTrue(record.posts.isNotEmpty())
        assertTrue(record.posts.size <= HomeSnapshotRepository.MAX_POSTS)
        assertTrue(encoded.encodeToByteArray().size <= HomeSnapshotRepository.MAX_BYTES)
        assertFalse(encoded.contains("accessToken"))
        assertFalse(encoded.contains("nextCursor"))
        assertTrue(record.posts.all { it.contentHtml.isEmpty() && it.summary == "Preview body" && it.previewReadingMinutes == 1 })
    }

    @Test
    fun lateResponsesCannotRestoreADeletedOrSwitchedAccountCache() = runTest {
        val store = FakeHomeSnapshotStore(snapshot())
        val repository = HomeSnapshotRepository(store, now = { now })
        repository.preload(origin, true)
        val oldLease = repository.lease(origin)

        repository.clear()
        repository.savePage(oldLease, TimelineScope.ForYou, listOf(post("late")))
        assertNull(store.snapshot)
        repository.rememberAccount(origin, user.copy(id = "other"))
        repository.savePage(oldLease, TimelineScope.ForYou, listOf(post("late")))

        assertTrue(store.snapshot!!.posts.isEmpty())
    }

    @Test
    fun aGuestCannotPersistAnAuthenticatedFeedAndDuplicatePostKeysAreRemoved() = runTest {
        val store = FakeHomeSnapshotStore()
        val repository = HomeSnapshotRepository(store, now = { now })
        repository.preload(origin, false)
        repository.savePage(repository.lease(origin), TimelineScope.ForYou, listOf(post("private")))
        assertNull(store.snapshot)
        repository.savePage(repository.lease(origin), TimelineScope.Global, listOf(post("one"), post("one")))

        assertEquals(listOf("one"), store.snapshot!!.posts.map(Post::id))
    }

    @Test
    fun cacheFailuresDoNotBreakStartupOrFreshReadingAndCancellationPropagates() = runTest {
        val store = FakeHomeSnapshotStore().apply { readFailure = IllegalStateException("unavailable") }
        val repository = HomeSnapshotRepository(store, now = { now })
        assertNull(repository.preload(origin, true)?.user)
        store.writeFailure = IllegalStateException("storage full")
        repository.rememberAccount(origin, user)
        repository.savePage(repository.lease(origin), TimelineScope.ForYou, listOf(post("fresh")))
        assertEquals("fresh", repository.snapshot.value!!.posts.single().id)
        store.readFailure = CancellationException("closed")
        assertFailsWith<CancellationException> { repository.preload(origin, true) }
    }

    @Test
    fun cachedCardsPreserveReadingTimeButDoNotPersistArticleHtml() = runTest {
        val store = FakeHomeSnapshotStore()
        val repository = HomeSnapshotRepository(store, now = { now })
        repository.preload(origin, false)
        repository.savePage(repository.lease(origin), TimelineScope.Global, listOf(post("long").copy(contentHtml = "<p>${"word ".repeat(600)}</p>")))

        val card = store.snapshot!!.posts.single()

        assertEquals(3, card.previewReadingMinutes)
        assertTrue(card.contentHtml.isEmpty())
        assertTrue(card.summary!!.length <= 180)
    }
}

private const val origin = "https://omicron.blog"
private const val now = 4_000_000_000L
private val user = AuthenticatedUser("reader", "reader@example.com", "reader", "Reader")
private fun snapshot() = HomeSnapshot(origin, user, now, "ForYou", listOf(post("cached")), now)
private fun post(id: String) = Post(id, "Title $id", null, null, "2026-10-14T12:00:00Z", PostAuthor("author", "author", "Author", null, false), emptyList(), 0, 0, 0, false)
