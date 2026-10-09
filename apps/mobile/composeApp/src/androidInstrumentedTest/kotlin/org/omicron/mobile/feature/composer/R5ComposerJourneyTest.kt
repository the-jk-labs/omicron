package org.omicron.mobile.feature.composer

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TagDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.data.api.UpdatePostRequest
import org.omicron.mobile.data.api.UploadResponseDto
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.domain.model.InstanceConfiguration

@RunWith(AndroidJUnit4::class)
class R5ComposerJourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun newPostSavesADraftAndShowsSaved() {
        val authoring = JourneyAuthoringApi()
        val viewModel = composerViewModel(authoring)
        var published: String? = null

        composeTestRule.setContent {
            OmicronTheme {
                ComposerRoute(viewModel = viewModel, onBack = {}, onSignIn = {}, onPublished = { published = it })
            }
        }

        composeTestRule.onNodeWithText("Title").performTextInput("Hello")
        composeTestRule.onNodeWithText("Write…").performTextInput("Body text")
        composeTestRule.onNodeWithText("Save draft").performClick()
        composeTestRule.waitForText("Saved")

        assertEquals("Hello", authoring.lastCreate?.title)
        assertEquals(null, published)
        viewModel.close()
    }

    @Test
    fun publishWithoutTitleShowsValidation() {
        val viewModel = composerViewModel(JourneyAuthoringApi())

        composeTestRule.setContent {
            OmicronTheme {
                ComposerRoute(viewModel = viewModel, onBack = {}, onSignIn = {}, onPublished = {})
            }
        }

        composeTestRule.onNodeWithText("Write…").performTextInput("Body text")
        composeTestRule.onNodeWithText("Publish").performClick()
        composeTestRule.waitForText("Add a title")

        viewModel.close()
    }

    @Test
    fun offlineSaveShowsErrorAndRetry() {
        val authoring = JourneyAuthoringApi(failure = IOException("unresolved"))
        val viewModel = composerViewModel(authoring)

        composeTestRule.setContent {
            OmicronTheme {
                ComposerRoute(viewModel = viewModel, onBack = {}, onSignIn = {}, onPublished = {})
            }
        }

        composeTestRule.onNodeWithText("Title").performTextInput("Hello")
        composeTestRule.onNodeWithText("Write…").performTextInput("Body text")
        composeTestRule.onNodeWithText("Save draft").performClick()
        composeTestRule.waitForText("You appear to be offline")
        composeTestRule.onNodeWithText("Try again").performClick()

        assertTrue(authoring.createCalls >= 1)
        viewModel.close()
    }

    @Test
    fun uploadedImageAppearsWithAltEditing() {
        val viewModel = composerViewModel(JourneyAuthoringApi())

        composeTestRule.setContent {
            OmicronTheme {
                ComposerRoute(viewModel = viewModel, onBack = {}, onSignIn = {}, onPublished = {})
            }
        }

        viewModel.pickImageResult(byteArrayOf(1, 2, 3), "image/png")
        composeTestRule.waitForText("Alt text")
        composeTestRule.onNodeWithContentDescription("Alt text (optional)").performTextInput("A photo")
        composeTestRule.waitForText("A photo")
        viewModel.close()
    }

    @Test
    fun unsupportedImageTypeShowsError() {
        val viewModel = composerViewModel(JourneyAuthoringApi())

        composeTestRule.setContent {
            OmicronTheme {
                ComposerRoute(viewModel = viewModel, onBack = {}, onSignIn = {}, onPublished = {})
            }
        }

        viewModel.pickImageResult(byteArrayOf(1, 2, 3), "image/svg+xml")
        composeTestRule.waitForText("Unsupported image type")
        viewModel.close()
    }

    @Test
    fun existingDraftLoadsIntoEditableFields() {
        val viewModel =
            ComposerViewModel(
                AuthoringRepository(JourneyAuthoringApi(), savedInstance = { instance() }, accessToken = { "signed-token" }),
                PostsRepository(JourneyPostsApi(), savedInstance = { instance() }, accessToken = { "signed-token" }),
                "post-1",
            )

        composeTestRule.setContent {
            OmicronTheme {
                ComposerRoute(viewModel = viewModel, onBack = {}, onSignIn = {}, onPublished = {})
            }
        }

        composeTestRule.waitForText("Hello")
        composeTestRule.onNodeWithText("Edit post").assertIsDisplayed()
        viewModel.close()
    }
}

private fun ComposeTestRule.waitForText(text: String) {
    waitUntil(timeoutMillis = 5_000) {
        onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty()
    }
}

private fun composerViewModel(authoring: JourneyAuthoringApi) =
    ComposerViewModel(
        AuthoringRepository(authoring, savedInstance = { instance() }, accessToken = { "signed-token" }),
        PostsRepository(JourneyPostsApi(), savedInstance = { instance() }, accessToken = { "signed-token" }),
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

private class JourneyAuthoringApi(
    private val failure: Throwable? = null,
) : AuthoringApi {
    var createCalls = 0
    var lastCreate: CreatePostRequest? = null

    override suspend fun createPost(origin: String, request: CreatePostRequest, accessToken: String): BarePostDto {
        createCalls += 1
        failure?.let { throw it }
        lastCreate = request
        return BarePostDto(id = "post-1", title = request.title, status = request.status, createdAt = "2026-01-01T00:00:00Z")
    }

    override suspend fun updatePost(origin: String, id: String, request: UpdatePostRequest, accessToken: String): BarePostDto {
        failure?.let { throw it }
        return BarePostDto(id = id, title = request.title, status = "draft", createdAt = "2026-01-01T00:00:00Z")
    }

    override suspend fun deletePost(origin: String, id: String, notify: Boolean, accessToken: String) = Unit

    override suspend fun drafts(origin: String, cursor: String?, accessToken: String): TimelinePageDto =
        TimelinePageDto(emptyList(), null)

    override suspend fun ownPosts(origin: String, status: String, cursor: String?, accessToken: String): TimelinePageDto =
        TimelinePageDto(emptyList(), null)

    override suspend fun ownCounts(origin: String, accessToken: String): OwnCountsDto = OwnCountsDto()

    override suspend fun uploadImage(origin: String, bytes: ByteArray, contentType: String, accessToken: String): UploadResponseDto =
        UploadResponseDto(url = "/api/uploads/photo-1.png")
}

private class JourneyPostsApi : PostsApi {
    override suspend fun timeline(origin: String, scope: TimelineScope, cursor: String?, accessToken: String?): TimelinePageDto =
        TimelinePageDto(emptyList(), null)

    override suspend fun feed(origin: String, cursor: String?, accessToken: String): TimelinePageDto =
        TimelinePageDto(emptyList(), null)

    override suspend fun post(origin: String, id: String, accessToken: String?): PostDto =
        PostDto(
            id = id,
            title = "Hello",
            contentHtml = "<p>Hello</p>",
            language = "en",
            status = "draft",
            createdAt = "2026-01-01T00:00:00Z",
            author = PostAuthorDto("user-1", "alice", "Alice"),
            tags = listOf(TagDto("technology", "Technology")),
        )

    override suspend fun relatedPosts(origin: String, id: String, accessToken: String?): List<PostDto> = emptyList()
}
