---
title: ''
date: 2025-01-16
type: landing

design:
  # Default section spacing
  spacing: "4rem"

# Note: `username` refers to the user's folder name in `content/authors/`

# Page sections
sections:
  - block: biography
    content:
      username: admin
      # Show a call-to-action button under your biography? (optional)
      button:
        text: Download Résumé
        url: uploads/resume.pdf
    design:
      banner:
        # Upload your cover image to the `assets/media/` folder and reference it here
        # filename: kalen-emsley-Bkci_8qcdvQ-unsplash.jpg
        filename: german-rojas-panorama-4858238_1920-pixabay.jpg
      biography:
        # Customize the style of your biography text
        style: 'text-align: justify; font-size: 0.8em;'
  - block: experience
    content:
      username: admin
    design:
      # Hugo date format
      date_format: 'January 2006'
      # Education or Experience section first?
      is_education_first: false
  - block: skills
    content:
      title: Skills & Hobbies
      username: admin
  - block: collection
    content:
      title: Selected Projects
      text: I enjoy making things. Here are a selection of projects that I have worked on over the years.
      filters:
        folders:
          - projects
    design:
      view: article-grid
      # view: card
      fill_image: false
      columns: 2
  - block: awards
    content:
      title: Certifications
      username: admin
  - block: languages
    content:
      title: Languages
      username: admin
---
