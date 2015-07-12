
var timeInterval = 5000;
var theta = 0; 

window.setInterval("rotate()" , timeInterval);

function flip(){

  $("#carousel").toggleClass("rotate");
  console.log("Working ?");
  

}


function rotate(){


	var carousel = document.getElementById('carousel');
	carousel.style['transform'] = 'translateZ( -288px ) rotateY(' + theta + 'deg)';
	

	theta -= 40;
	
	console.log("theta: " + theta);

	
	
}

function youTubeImageHover(){

$("#YouTube-image").attr('src' , 'images/youPlay.png')

}

function youTubeImageOut(){

$("#YouTube-image").attr('src' , 'images/youT.png')

}

function logoIn(){
$("#logo").attr('src' , 'images/R_noise.jpg')

}

function logoOut(){
$("#logo").attr('src' , 'images/R_medum.jpg')
}

