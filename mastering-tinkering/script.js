let slideIndex = 1;

// Function to handle Next/Prev clicks
function plusSlides(n) {
    showSlides(slideIndex += n);
}

function showSlides(n) {
    let i;
    let slides = document.getElementsByClassName("carousel-slide");

    // Loop back to start if at the end
    if (n > slides.length) {slideIndex = 1}
    // Loop to end if at the start
    if (n < 1) {slideIndex = slides.length}

    // Hide all slides
    for (i = 0; i < slides.length; i++) {
        slides[i].style.display = "none";
        slides[i].classList.remove("active");
    }

    // Show the current slide
    slides[slideIndex-1].style.display = "flex";
    slides[slideIndex-1].classList.add("active");
}
