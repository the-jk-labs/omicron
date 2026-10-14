package org.omicron.mobile.data.repository

import io.ktor.util.date.getTimeMillis
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.omicron.mobile.core.storage.HomeSnapshotStore
import org.omicron.mobile.core.article.postPreview
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.HomeSnapshot
import org.omicron.mobile.domain.model.Post

class HomeSnapshotRepository(
    private val store: HomeSnapshotStore,
    private val now: () -> Long = ::getTimeMillis,
) {
    private val mutex = Mutex()
    private val mutableSnapshot = MutableStateFlow<HomeSnapshot?>(null)
    val snapshot: StateFlow<HomeSnapshot?> = mutableSnapshot.asStateFlow()
    private var current: HomeSnapshot?
        get() = mutableSnapshot.value
        set(value) { mutableSnapshot.value = value }
    private var generation = 0L

    suspend fun preload(origin: String, hasSessionCookie: Boolean): HomeSnapshot? = mutex.withLock {
        generation++
        val stored = safely { store.read() }
        val valid = stored?.takeIf {
            it.version == 1 && it.origin == origin &&
                now() - it.accountUpdatedAtMillis in 0..ACCOUNT_MAX_AGE_MILLIS &&
                (it.user == null || hasSessionCookie) &&
                TimelineScope.entries.any { scope -> scope.name == it.scope } &&
                (it.scope != TimelineScope.ForYou.name || it.user != null) &&
                it.posts.size <= MAX_POSTS && encodedSize(it) <= MAX_BYTES
        }
        current = valid?.let {
            if (it.postsUpdatedAtMillis?.let { timestamp -> now() - timestamp in 0..POSTS_MAX_AGE_MILLIS } == true) it
            else it.copy(posts = emptyList(), postsUpdatedAtMillis = null)
        } ?: HomeSnapshot(origin, null, now())
        if (stored != null && valid == null) safely { store.clear() }
        if (valid != null && valid.postsUpdatedAtMillis != null && current?.postsUpdatedAtMillis == null) {
            safely { store.clear() }
            safely { store.write(current!!) }
        }
        current
    }

    suspend fun rememberAccount(origin: String, user: AuthenticatedUser?) = mutex.withLock {
        val previous = current
        val sameOwner = previous?.origin == origin && previous.user?.id == user?.id
        if (!sameOwner) {
            generation++
            safely { store.clear() }
        }
        current = if (sameOwner) previous.copy(user = user, accountUpdatedAtMillis = now())
        else HomeSnapshot(origin, user, now())
        safely { store.write(current!!) }
    }

    suspend fun lease(origin: String): HomeSnapshotLease? = mutex.withLock {
        current?.takeIf { it.origin == origin }?.let { HomeSnapshotLease(origin, it.user?.id, generation) }
    }

    suspend fun savePage(lease: HomeSnapshotLease?, scope: TimelineScope, posts: List<Post>) = mutex.withLock {
        val previous = current ?: return@withLock
        if (lease == null || lease.generation != generation || lease.origin != previous.origin || lease.userId != previous.user?.id) return@withLock
        if (scope == TimelineScope.ForYou && previous.user == null) return@withLock
        val cards = posts.distinctBy(Post::id).take(MAX_POSTS).map { post ->
            val preview = postPreview(post.summary, post.contentHtml)
            post.copy(summary = preview.excerpt.take(180), contentHtml = "", previewReadingMinutes = preview.readingMinutes)
        }
        var snapshot = previous.copy(scope = scope.name, posts = cards, postsUpdatedAtMillis = now())
        while (snapshot.posts.isNotEmpty() && encodedSize(snapshot) > MAX_BYTES) {
            snapshot = snapshot.copy(posts = snapshot.posts.dropLast(1))
        }
        if (posts.isNotEmpty() && snapshot.posts.isEmpty()) snapshot = snapshot.copy(postsUpdatedAtMillis = null)
        if (encodedSize(snapshot) > MAX_BYTES) return@withLock
        current = snapshot
        safely { store.write(snapshot) }
    }

    suspend fun clear(origin: String? = null) = mutex.withLock {
        generation++
        current = origin?.let { HomeSnapshot(it, null, now()) }
        safely { store.clear() }
    }

    suspend fun discardPage(origin: String) = mutex.withLock {
        val previous = current?.takeIf { it.origin == origin } ?: return@withLock
        generation++
        current = previous.copy(posts = emptyList(), postsUpdatedAtMillis = null)
        safely { store.clear() }
        safely { store.write(current!!) }
    }

    private suspend fun <T> safely(block: suspend () -> T): T? = try {
        block()
    } catch (exception: CancellationException) {
        throw exception
    } catch (_: Throwable) {
        null
    }

    private fun encodedSize(snapshot: HomeSnapshot) = Json.encodeToString(snapshot).encodeToByteArray().size

    companion object {
        const val MAX_POSTS = 30
        const val MAX_BYTES = HomeSnapshotStore.MAX_BYTES
        const val POSTS_MAX_AGE_MILLIS = 24 * 60 * 60 * 1_000L
        const val ACCOUNT_MAX_AGE_MILLIS = 30 * 24 * 60 * 60 * 1_000L
    }
}

data class HomeSnapshotLease(
    val origin: String,
    val userId: String?,
    val generation: Long,
)
