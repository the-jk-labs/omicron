package org.omicron.mobile.data.repository

import org.omicron.mobile.data.api.FakeSocialApi
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class SocialRepositoryTest {
    @Test
    fun mapsLocalProfileAndResolvesAvatarAgainstTheSelectedInstance() = runTest {
        val api = FakeSocialApi()
        val repository = SocialRepository(api, savedInstance = { instance() })

        val profile = repository.profile("writer", remote = false)

        assertEquals("writer", profile.user.username)
        assertEquals("https://omicron.blog/avatars/writer.jpg", profile.user.avatarUrl)
        assertEquals("Writing", profile.user.tags.single().name)
        assertEquals("Website", profile.user.links.single().label)
        assertEquals(4, profile.followerCount)
        assertFalse(profile.locked)
        assertFalse(profile.remote)
    }

    @Test
    fun mapsRemoteProfileAndFederatedIdentity() = runTest {
        val repository = SocialRepository(FakeSocialApi(), savedInstance = { instance() })

        val profile = repository.profile("writer@remote.example", remote = true)

        assertEquals("Remote Writer", profile.user.displayName)
        assertEquals("remote.example", profile.user.host)
        assertEquals("https://remote.example/@writer", profile.user.profileUrl)
        assertTrue(profile.remote)
    }

    @Test
    fun profilePostsRetainCursorAndViewerEngagement() = runTest {
        val api = FakeSocialApi()
        api.postPage = TimelinePageDto(items = listOf(postDto()), nextCursor = "opaque-profile-cursor")
        val repository = SocialRepository(api, savedInstance = { instance() })

        val page = repository.profilePosts("writer", remote = false, recommendations = false, cursor = null)

        assertEquals("opaque-profile-cursor", page.nextCursor)
        assertEquals("https://omicron.blog/avatars/writer.jpg", page.items.single().author.avatarUrl)
        assertTrue(page.items.single().liked)
        assertTrue(page.items.single().recommended)
    }

    @Test
    fun likesUseTheOriginScopedBearerTokenAndKeepTheServerResult() = runTest {
        val api = FakeSocialApi()
        val repository = SocialRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val result = repository.setPostLike("post-1", liked = true)

        assertEquals(listOf("signed-token"), api.postLikeTokens)
        assertEquals(3, result.count)
        assertTrue(result.active)
    }

    @Test
    fun savesUseTheConfirmedReadLaterListAndCanBeRemoved() = runTest {
        val api = FakeSocialApi()
        val repository = SocialRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val initial = repository.readLaterState("post-1")
        repository.setReadLater("post-1", initial.listId, saved = true)
        val saved = repository.readLaterState("post-1")
        repository.setReadLater("post-1", saved.listId, saved = false)

        assertEquals("read-later", initial.listId)
        assertFalse(initial.saved)
        assertTrue(saved.saved)
        assertFalse(api.saved)
    }

    @Test
    fun rejectsSocialMutationsWhenNoSessionTokenIsAvailable() = runTest {
        val repository = SocialRepository(FakeSocialApi(), savedInstance = { instance() })

        assertFailsWith<UnauthorizedException> { repository.setPostLike("post-1", liked = true) }
    }

    private fun postDto() =
        PostDto(
            id = "post-1",
            title = "Hello",
            summary = null,
            bannerUrl = null,
            createdAt = "2026-01-01T00:00:00Z",
            author = PostAuthorDto("user-2", "writer", "Writer", "/avatars/writer.jpg"),
            likeCount = 3,
            liked = true,
            commentCount = 1,
            recommendCount = 2,
            recommended = true,
        )

    private fun instance() =
        InstanceConfiguration(
            origin = "https://omicron.blog",
            name = "Omicron",
            domain = "omicron.blog",
            federationEnabled = true,
            setupComplete = true,
            emailEnabled = true,
            emailVerificationRequired = true,
        )
}
