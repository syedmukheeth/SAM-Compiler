async function pushToGithub({ token, repo, path, content, message }) {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });

  try {
    // 1. Get current user's login
    const { data: user } = await octokit.rest.users.getAuthenticated();
    const owner = user.login;

    // 2. Try to get the file to see if it exists (for SHA)
    let sha;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path
      });
      sha = fileData.sha;
    } catch (err) {
      // File doesn't exist, that's fine
    }

    // 3. Create or update file
    const { data: result } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: message || `Update ${path} via LiquidIDE`,
      content: Buffer.from(content).toString("base64"),
      sha
    });

    return {
      success: true,
      url: result.content.html_url,
      commit: result.commit.sha
    };
  } catch (err) {
    throw new Error(`GitHub Push Failed: ${err.message}`);
  }
}

module.exports = { pushToGithub };
