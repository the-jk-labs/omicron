package org.omicron.mobile.feature.manage

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.data.api.AuthoringApi
import org.omicron.mobile.data.api.BarePostDto
import org.omicron.mobile.data.api.CreatePostRequest
import org.omicron.mobile.data.api.OwnCountsDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.UpdatePostRequest
import org.omicron.mobile.data.api.UploadResponseDto
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.domain.model.InstanceConfiguration

@RunWith(AndroidJUnit4::class)
class ManageJourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun tabsShowCountsAndLoadTheirPosts() {
        val api = ManageJourneyApi(initialPosts())
        val viewModel = manageViewModel(api)
        composeTestRule.setContent {
            OmicronTheme {
                ManageRoute(viewModel, onBack = {}, onSignIn = {}, onEdit = {}, onView = {})
            }
        }

        composeTestRule.waitForText("Draft A")
        composeTestRule.onNodeWithText("Drafts (1)").assertIsDisplayed()
        composeTestRule.onNodeWithText("Scheduled (1)").performClick()
        composeTestRule.waitForText("Queued post")
        composeTestRule.onNodeWithText("Publishes", substring = true).assertIsDisplayed()
        viewModel.close()
    }

    @Test
    fun draftCanBeScheduledFromItsManageRow() {
        val api = ManageJourneyApi(initialPosts().filter { it.status == "draft" })
        val viewModel = manageViewModel(api)
        composeTestRule.setContent {
            OmicronTheme {
                ManageRoute(viewModel, onBack = {}, onSignIn = {}, onEdit = {}, onView = {})
            }
        }

        composeTestRule.waitForText("Draft A")
        composeTestRule.onNodeWithText("Schedule…").performClick()
        composeTestRule.waitForText("Schedule post")
        composeTestRule.onNodeWithText("Tomorrow, 09:00").performClick()
        composeTestRule.onNodeWithText("Schedule").performClick()
        composeTestRule.waitUntil(timeoutMillis = 5_000) { api.lastUpdate?.status == "scheduled" }

        assertNotNull(api.lastUpdate?.publishAt)
        composeTestRule.waitForText("Nothing unfinished")
        viewModel.close()
    }

    @Test
    fun deletingDraftRequiresConfirmation() {
        val api = ManageJourneyApi(initialPosts().filter { it.status == "draft" })
        val viewModel = manageViewModel(api)
        composeTestRule.setContent {
            OmicronTheme {
                ManageRoute(viewModel, onBack = {}, onSignIn = {}, onEdit = {}, onView = {})
            }
        }

        composeTestRule.waitForText("Draft A")
        composeTestRule.onNodeWithText("Delete").performClick()
        composeTestRule.waitForText("Delete draft")
        composeTestRule.onAllNodesWithText("Delete").get(1).performClick()
        composeTestRule.waitUntil(timeoutMillis = 5_000) { api.deletedIds.contains("draft-1") }

        assertEquals(listOf("draft-1"), api.deletedIds)
        composeTestRule.waitForText("Nothing unfinished")
        viewModel.close()
    }

    private fun manageViewModel(api: ManageJourneyApi) =
        ManageViewModel(
            AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" }),
        )

    private fun ComposeTestRule.waitForText(text: String) {
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty()
        }
    }
}

private fun initialPosts() =
    listOf(
        journeyPost("draft-1", "Draft A", "draft"),
        journeyPost("scheduled-1", "Queued post", "scheduled", publishAt = "2026-12-01T09:00:00Z"),
        journeyPost("published-1", "Live post", "published"),
    )

private fun journeyPost(id: String, title: String, status: String, publishAt: String? = null) =
    PostDto(
        id = id,
        title = title,
        contentHtml = "<p>$title</p>",
        status = status,
        publishAt = publishAt,
        summary = "Summary for $title",
        createdAt = "2026-01-01T00:00:00Z",
        updatedAt = "2026-01-02T00:00:00Z",
        author = PostAuthorDto("user-1", "alice", "Alice"),
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

private class ManageJourneyApi(initial: List<PostDto>) : AuthoringApi {
    private val posts = initial.toMutableList()
    val deletedIds = mutableListOf<String>()
    var lastUpdate: UpdatePostRequest? = null

    override suspend fun createPost(origin: String, request: CreatePostRequest, accessToken: String): BarePostDto =
        throw UnsupportedOperationException()

    override suspend fun updatePost(origin: String, id: String, request: UpdatePostRequest, accessToken: String): BarePostDto {
        lastUpdate = request
        val index = posts.indexOfFirst { it.id == id }
        if (index >= 0) {
            val current = posts[index]
            posts[index] =
                current.copy(
                    status = request.status ?: current.status,
                    publishAt = if (request.status == "scheduled") request.publishAt else null,
                )
        }
        return BarePostDto(id = id, title = posts.getOrNull(index)?.title, status = request.status, createdAt = "2026-01-01T00:00:00Z")
    }

    override suspend fun deletePost(origin: String, id: String, notify: Boolean, accessToken: String) {
        deletedIds += id
        posts.removeAll { it.id == id }
    }

    override suspend fun drafts(origin: String, cursor: String?, accessToken: String): TimelinePageDto = TimelinePageDto()

    override suspend fun ownPosts(origin: String, status: String, cursor: String?, accessToken: String): TimelinePageDto =
        TimelinePageDto(posts.filter { it.status == status })

    override suspend fun ownCounts(origin: String, accessToken: String): OwnCountsDto =
        OwnCountsDto(
            draft = posts.count { it.status == "draft" },
            scheduled = posts.count { it.status == "scheduled" },
            published = posts.count { it.status == "published" },
        )

    override suspend fun uploadImage(origin: String, bytes: ByteArray, contentType: String, accessToken: String): UploadResponseDto =
        throw UnsupportedOperationException()
}
