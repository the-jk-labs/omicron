package org.omicron.mobile.feature.composer

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
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
import org.omicron.mobile.domain.model.ComposerBlock
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.OwnPostStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ComposerViewModelTest {
    @Test
    fun newComposerStartsWithOneEmptyParagraph() = runTest {
        val viewModel = composerViewModel()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<ComposerLoadPhase.Content>(state.loadPhase)
        assertEquals(1, state.blocks.size)
        assertIs<ComposerBlock.Paragraph>(state.blocks.single())
        assertNull(state.postId)
    }

    @Test
    fun existingDraftLoadsTitleBlocksAndMetadata() = runTest {
        val viewModel = composerViewModel(postId = "post-1")
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<ComposerLoadPhase.Content>(state.loadPhase)
        assertEquals("Hello", state.title)
        assertEquals("en", state.language)
        assertEquals("technology", state.tags)
        assertTrue(state.blocks.any { it is ComposerBlock.Paragraph && (it as ComposerBlock.Paragraph).text == "Hello" })
        assertEquals(OwnPostStatus.Draft, state.sourceStatus)
    }

    @Test
    fun draftLoadFailureMapsOfflineAndRetries() = runTest {
        val posts = FailingPostsApi(failure = IOException("unresolved"))
        val viewModel = composerViewModel(postsApi = posts, postId = "post-1")
        testScheduler.advanceUntilIdle()

        assertEquals(ComposerLoadPhase.Error(ComposerError.Offline), viewModel.uiState.value.loadPhase)
    }

    @Test
    fun editingBlocksMarksDirtyAndAutosavesADraft() = runTest {
        val authoring = RecordingAuthoringApi()
        val viewModel = composerViewModel(authoringApi = authoring)
        testScheduler.advanceUntilIdle()

        viewModel.updateTitle("Hello")
        viewModel.updateBlockText(viewModel.uiState.value.blocks.single().id, "Body text")
        assertTrue(viewModel.uiState.value.dirty)
        testScheduler.advanceTimeBy(2000)
        testScheduler.advanceUntilIdle()

        assertEquals(1, authoring.createCalls)
        assertEquals("Hello", authoring.lastCreate?.title)
        assertEquals("draft", authoring.lastCreate?.status)
        val state = viewModel.uiState.value
        assertIs<ComposerSave.Saved>(state.save)
        assertEquals("post-1", state.postId)
        assertEquals(false, state.dirty)
    }

    @Test
    fun secondAutosaveUpdatesInsteadOfCreating() = runTest {
        val authoring = RecordingAuthoringApi()
        val viewModel = composerViewModel(authoringApi = authoring)
        testScheduler.advanceUntilIdle()

        viewModel.updateBlockText(viewModel.uiState.value.blocks.single().id, "First")
        testScheduler.advanceTimeBy(2000)
        testScheduler.advanceUntilIdle()
        viewModel.updateBlockText(viewModel.uiState.value.blocks.single().id, "Second")
        testScheduler.advanceTimeBy(2000)
        testScheduler.advanceUntilIdle()

        assertEquals(1, authoring.createCalls)
        assertEquals(1, authoring.updateCalls)
        assertNull(authoring.lastUpdate?.status)
    }

    @Test
    fun emptyComposerNeverAutosaves() = runTest {
        val authoring = RecordingAuthoringApi()
        val viewModel = composerViewModel(authoringApi = authoring)
        testScheduler.advanceUntilIdle()

        testScheduler.advanceTimeBy(10000)
        testScheduler.advanceUntilIdle()

        assertEquals(0, authoring.createCalls)
    }

    @Test
    fun publishRequiresATitle() = runTest {
        val viewModel = composerViewModel()
        testScheduler.advanceUntilIdle()

        viewModel.updateBlockText(viewModel.uiState.value.blocks.single().id, "Body")
        testScheduler.advanceUntilIdle()
        viewModel.publish()
        testScheduler.advanceUntilIdle()

        assertEquals(ComposerPublish.Validation(PublishIssue.MissingTitle), viewModel.uiState.value.publish)
    }

    @Test
    fun publishCreatesAPublishedPost() = runTest {
        val authoring = RecordingAuthoringApi()
        val viewModel = composerViewModel(authoringApi = authoring)
        testScheduler.advanceUntilIdle()

        viewModel.updateTitle("Hello")
        viewModel.updateBlockText(viewModel.uiState.value.blocks.single().id, "Body")
        viewModel.publish()
        testScheduler.advanceUntilIdle()

        assertEquals(1, authoring.createCalls)
        assertEquals(0, authoring.updateCalls)
        assertEquals("published", authoring.lastCreate?.status)
        assertIs<ComposerPublish.Published>(viewModel.uiState.value.publish)
    }

    @Test
    fun addAndRemoveBlocks() = runTest {
        val viewModel = composerViewModel()
        testScheduler.advanceUntilIdle()

        viewModel.addBlock(ComposerBlockType.Heading)
        viewModel.addBlock(ComposerBlockType.Divider)
        testScheduler.advanceUntilIdle()
        assertEquals(3, viewModel.uiState.value.blocks.size)

        val headingId = viewModel.uiState.value.blocks.filterIsInstance<ComposerBlock.Heading>().single().id
        viewModel.updateBlockText(headingId, "Section")
        viewModel.removeBlock(viewModel.uiState.value.blocks.first().id)
        testScheduler.advanceUntilIdle()

        val blocks = viewModel.uiState.value.blocks
        assertEquals(2, blocks.size)
        assertEquals("Section", (blocks.first() as ComposerBlock.Heading).text)
    }

    @Test
    fun tagsAreNormalizedToFive() = runTest {
        val authoring = RecordingAuthoringApi()
        val viewModel = composerViewModel(authoringApi = authoring)
        testScheduler.advanceUntilIdle()

        viewModel.updateBlockText(viewModel.uiState.value.blocks.single().id, "Body")
        viewModel.updateTags("Kotlin,  #android android, kotlin, one, two, three, four")
        viewModel.saveDraft()
        testScheduler.advanceUntilIdle()

        assertEquals(listOf("kotlin", "android", "one", "two", "three"), authoring.lastCreate?.tags)
    }

    private fun TestScope.composerViewModel(
        authoringApi: AuthoringApi = RecordingAuthoringApi(),
        postsApi: PostsApi = DraftPostsApi(),
        postId: String? = null,
    ): ComposerViewModel {
        val dispatcher = StandardTestDispatcher(testScheduler)
        return ComposerViewModel(
            AuthoringRepository(authoringApi, savedInstance = { instance() }, accessToken = { "signed-token" }),
            PostsRepository(postsApi, savedInstance = { instance() }, accessToken = { "signed-token" }),
            postId,
            TestScope(dispatcher),
        )
    }

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

    private class RecordingAuthoringApi : AuthoringApi {
        var createCalls = 0
        var updateCalls = 0
        var lastCreate: CreatePostRequest? = null
        var lastUpdate: UpdatePostRequest? = null

        override suspend fun createPost(origin: String, request: CreatePostRequest, accessToken: String): BarePostDto {
            createCalls += 1
            lastCreate = request
            return BarePostDto(id = "post-1", title = request.title, status = request.status, createdAt = "2026-01-01T00:00:00Z")
        }

        override suspend fun updatePost(origin: String, id: String, request: UpdatePostRequest, accessToken: String): BarePostDto {
            updateCalls += 1
            lastUpdate = request
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

    private class DraftPostsApi : PostsApi {
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
                summary = null,
                status = "draft",
                createdAt = "2026-01-01T00:00:00Z",
                author = PostAuthorDto("user-1", "alice", "Alice"),
                tags = listOf(TagDto("technology", "Technology")),
            )

        override suspend fun relatedPosts(origin: String, id: String, accessToken: String?): List<PostDto> = emptyList()
    }

    private class FailingPostsApi(
        private val failure: Throwable,
    ) : PostsApi by DraftPostsApi() {
        override suspend fun post(origin: String, id: String, accessToken: String?): PostDto = throw failure
    }
}
