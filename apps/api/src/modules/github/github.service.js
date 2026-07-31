/**
 * Thrown when the signed-in user has no linked GitHub account. Carries a status
 * so the route layer answers 400 instead of letting it fall through to the
 * generic handler as a 500, which is what an unlinked account used to produce.
 */
class GithubNotLinkedError extends Error {
  constructor() {
    super("No GitHub account linked. Sign in with GitHub to use this feature.");
    this.name = "GithubNotLinkedError";
    this.status = 400;
  }
}

async function getUserRepos({ user: authUser }) {
  const { Octokit } = await import("@octokit/rest");
  const githubToken = authUser?.githubToken;
  if (!githubToken) throw new GithubNotLinkedError();

  const octokit = new Octokit({ auth: githubToken });
  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 20
    });
    return data.map(r => ({
      name: r.name,
      full_name: r.full_name,
      url: r.html_url,
      private: r.private,
      default_branch: r.default_branch
    }));
  } catch (err) {
    throw new Error(`Failed to fetch repositories: ${err.message}`);
  }
}

async function pushToGithub({ repo, path, content, message, branch, user: authUser }) {
  const { Octokit } = await import("@octokit/rest");

  // Only the caller's own stored OAuth token is used. This previously accepted
  // a `token` from the request body and *preferred* it over the stored one,
  // which turned the endpoint into an open authenticated GitHub proxy for any
  // PAT anyone chose to POST.
  const githubToken = authUser?.githubToken;
  if (!githubToken) throw new GithubNotLinkedError();

  const octokit = new Octokit({ auth: githubToken });

  try {
    // 1. Resolve owner and repo name
    // If repo is "owner/name", split it. Otherwise, use authenticated user as owner.
    let [specOwner, specRepo] = repo.includes("/") ? repo.split("/") : [null, repo];
    
    const { data: ghUser } = await octokit.rest.users.getAuthenticated();
    const owner = specOwner || ghUser.login;
    const repoName = specRepo;

    // 2. Try to get the file to see if it exists (for SHA)
    let sha;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path,
        ref: branch
      });
      sha = fileData.sha;
    } catch {
      // File doesn't exist, that's fine
    }

    // 3. Create or update file
    const { data: result } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path,
      message: message || `Update ${path} via SAM Compiler`,
      content: Buffer.from(content).toString("base64"),
      sha,
      branch
    });

    return {
      success: true,
      url: result.content.html_url,
      commit: result.commit.sha,
      repo: repoName,
      branch: branch || "default"
    };
  } catch (err) {
    throw new Error(`GitHub Push Failed: ${err.message}`);
  }
}

module.exports = { pushToGithub, getUserRepos, GithubNotLinkedError };
